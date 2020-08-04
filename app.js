const axios = require('axios');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const promiseRetry = require('promise-retry');
const stringify = require('json-stringify-safe');

// eslint-disable-next-line no-unused-vars
const pkginfo = require('pkginfo')(module);
const mkdirp = require('mkdirp');

const { transports } = require('winston');
const logger = require('./lib/logger');
const configuration = require('./config');

const bpjsonatatransform = require('./lib/streams/backpressuretransform.jsonata');
const bpteamstransform = require('./lib/streams/backpressuretransform.teams');

const NODE_ENV = process.env.NODE_ENV || 'production';

/**
 * Call Percipio API
 *
 * @param {*} options
 * @returns
 */
const callPercipio = async (options) => {
  return promiseRetry(async (retry, numberOfRetries) => {
    const loggingOptions = {
      label: 'callPercipio',
    };

    const requestUri = options.request.uri;
    logger.debug(`Request URI: ${requestUri}`, loggingOptions);

    let requestParams = options.request.query || {};
    requestParams = _.omitBy(requestParams, _.isNil);
    logger.debug(
      `Request Querystring Parameters: ${JSON.stringify(requestParams)}`,
      loggingOptions
    );

    let requestBody = options.request.body || {};
    requestBody = _.omitBy(requestBody, _.isNil);
    logger.debug(`Request Body: ${JSON.stringify(requestBody)}`, loggingOptions);

    const axiosConfig = {
      url: requestUri,
      headers: {
        Authorization: `Bearer ${options.request.bearer}`,
      },
      method: options.request.method,
    };

    if (!_.isEmpty(requestBody)) {
      axiosConfig.data = requestBody;
    }

    if (!_.isEmpty(requestParams)) {
      axiosConfig.params = requestParams;
    }

    logger.debug(`Axios Config: ${JSON.stringify(axiosConfig)}`, loggingOptions);

    try {
      const response = await axios.request(axiosConfig);
      logger.debug(`Response Headers: ${JSON.stringify(response.headers)}`, loggingOptions);
      logger.silly(`Response Body: ${JSON.stringify(response.data)}`, loggingOptions);

      return response;
    } catch (err) {
      logger.warn(
        `Trying to get report. Got Error after Attempt# ${numberOfRetries} : ${err}`,
        loggingOptions
      );
      if (err.response) {
        logger.debug(`Response Headers: ${JSON.stringify(err.response.headers)}`, loggingOptions);
        logger.debug(`Response Body: ${JSON.stringify(err.response.data)}`, loggingOptions);
      } else {
        logger.debug('No Response Object available', loggingOptions);
      }
      if (numberOfRetries < options.retry_options.retries + 1) {
        retry(err);
      } else {
        logger.error('Failed to call Percipio', loggingOptions);
      }
      throw err;
    }
  }, options.retry_options);
};

/**
 * Loop thru calling the API until all records delivered,
 * pass thru a stream and return and array of cards
 *
 * @param {*} options
 * @returns {[]} array of card JSON
 */
const getAllMetadataAndTransformToCards = async (options) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    const loggingOptions = {
      label: 'getAllMetadataAndTransformToCards',
    };

    const opts = options;

    // const results = [];

    let keepGoing = true;
    let reportCount = true;
    let totalRecords = 0;
    let downloadedRecords = 0;

    const step1 = new bpjsonatatransform.JSONataStream(options); // Use object mode and outputs object
    const step2 = new bpteamstransform.TeamsStream(options); // Use object mode and outputs object

    const outputStream = step1.pipe(step2);

    outputStream.on('finish', () => {
      logger.info('Outputstream Finish.', loggingOptions);
    });

    step1.on('error', (error) => {
      logger.error(`Error. Path: ${stringify(error)}`, loggingOptions);
    });

    step2.on('error', (error) => {
      logger.error(`Error. Path: ${stringify(error)}`, loggingOptions);
    });

    while (keepGoing) {
      let response = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        response = await callPercipio(opts);

        if (reportCount) {
          totalRecords = parseInt(response.headers['x-total-count'], 10);

          logger.info(
            `Total Records to download as reported in header['x-total-count'] ${totalRecords.toLocaleString()}`,
            loggingOptions
          );
          reportCount = false;
        }
      } catch (err) {
        logger.error('ERROR: trying to download results', loggingOptions);
        keepGoing = false;
        reject(err);
      }

      downloadedRecords += response.data.length;

      // Stream the results
      // Iterate over the records and write EACH ONE to the  stream individually.
      // Each one of these records will become a line in the output file.
      response.data.forEach((record) => {
        step1.write(JSON.stringify(record));
      });

      logger.info(
        `Records Downloaded ${downloadedRecords.toLocaleString()} of ${totalRecords.toLocaleString()}`,
        loggingOptions
      );

      // Set offset - number of records in response
      opts.request.query.offset += response.data.length;

      if (opts.request.query.offset >= totalRecords) {
        keepGoing = false;
      }
    }

    step1.end();
    step2.on('finish', () => {
      logger.info('Records Posted.', loggingOptions);
      resolve(null);
    });
  });
};

/**
 * Process the Percipio call
 *
 * @param {*} options
 * @returns
 */
const main = async (configOptions) => {
  const loggingOptions = {
    label: 'main',
  };

  const options = configOptions || null;

  if (_.isNull(options)) {
    logger.error('Invalid configuration', loggingOptions);
    return false;
  }

  // Set logging to silly level for dev
  if (NODE_ENV.toUpperCase() === 'DEVELOPMENT') {
    logger.level = 'debug';
  } else {
    logger.level = options.debug.loggingLevel;
  }

  // Create logging folder if one does not exist
  if (!_.isNull(options.debug.logpath)) {
    if (!fs.existsSync(options.debug.logpath)) {
      mkdirp(options.debug.logpath);
    }
  }

  // Add logging to a file
  logger.add(
    new transports.File({
      filename: Path.join(options.debug.logpath, options.debug.logFile),
      options: {
        flags: 'w',
      },
    })
  );

  options.logger = logger;

  logger.info(`Start ${module.exports.name}`, loggingOptions);

  logger.debug(`Options: ${stringify(options)}`, loggingOptions);

  if (_.isNull(options.teamswebhookurl)) {
    logger.error('Invalid configuration - no teamswebhookurl or set env TEAMSURL', loggingOptions);
    return false;
  }

  if (_.isNull(options.request.path.orgId)) {
    logger.error(
      'Invalid configuration - no orgid in config file or set env ORGID',
      loggingOptions
    );
    return false;
  }

  if (_.isNull(options.request.bearer)) {
    logger.error('Invalid configuration - no bearer or set env BEARER', loggingOptions);
    return false;
  }

  logger.info('Calling Percipio', loggingOptions);
  await getAllMetadataAndTransformToCards(options).catch((err) => {
    logger.error(`Error:  ${err}`, loggingOptions);
  });
  logger.info(`End ${module.exports.name}`, loggingOptions);
  return true;
};

main(configuration);
