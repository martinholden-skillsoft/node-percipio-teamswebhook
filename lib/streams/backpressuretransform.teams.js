const axios = require('axios');
const promiseRetry = require('promise-retry');
const _ = require('lodash');
const stringify = require('json-stringify-safe');
const { BackPressureTransform } = require('./back-pressure-transform');

class TeamsStream extends BackPressureTransform {
  constructor(options) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
      ...options,
    });

    this.options = options;

    this.loggingOptions = {
      label: 'TeamsStream',
    };
    this.logger = typeof this.options.logger === 'object' ? this.options.logger : null;
    this.log = typeof this.options.logger === 'object';
    this.logcount = this.options.logcount || 100;
    this.teamswebhookurl = options.teamswebhookurl;

    if (this.log) {
      this.logger.debug(`Teams Incoming Webhook: ${this.teamswebhookurl}`, this.loggingOptions);
    }
  }

  async postToTeams(body) {
    return promiseRetry(async (retry, numberOfRetries) => {
      const loggingOptions = {
        label: 'postToTeams',
      };

      const requestUri = this.teamswebhookurl;
      this.logger.debug(`Request URI: ${requestUri}`, loggingOptions);

      const requestBody = body || {};
      this.logger.debug(`Request Body: ${JSON.stringify(requestBody)}`, loggingOptions);

      const axiosConfig = {
        url: requestUri,
        method: 'POST',
      };

      if (!_.isEmpty(requestBody)) {
        axiosConfig.data = requestBody;
      }

      this.logger.debug(`Axios Config: ${JSON.stringify(axiosConfig)}`, loggingOptions);

      try {
        const response = await axios.request(axiosConfig);
        this.logger.debug(`Response Headers: ${JSON.stringify(response.headers)}`, loggingOptions);
        this.logger.silly(`Response Body: ${JSON.stringify(response.data)}`, loggingOptions);

        return response;
      } catch (err) {
        this.logger.warn(
          `Trying to get report. Got Error after Attempt# ${numberOfRetries} : ${err}`,
          loggingOptions
        );
        if (err.response) {
          this.logger.debug(
            `Response Headers: ${JSON.stringify(err.response.headers)}`,
            loggingOptions
          );
          this.logger.debug(`Response Body: ${JSON.stringify(err.response.data)}`, loggingOptions);
        } else {
          this.logger.debug('No Response Object available', loggingOptions);
        }
        if (numberOfRetries < this.options.retry_options.retries + 1) {
          retry(err);
        } else {
          this.logger.error('Failed to call Teams', loggingOptions);
        }
        throw err;
      }
    }, this.options.retry_options);
  }

  async _transform(chunk, encoding, callback) {
    /**
     * Push the object to ES and indicate that we are ready for the next one.
     * Be sure to propagate any errors:
     */
    const self = this;
    let data = chunk;

    if (self.log && self.counter % self.logcount === 0) {
      self.logger.info(
        `Processing. Processed: ${self.counter.toLocaleString()}`,
        self.loggingOptions
      );
    }

    if (typeof chunk === 'object' && chunk !== null) {
      data = stringify(chunk);
    }
    const payload = data;

    try {
      let result = null;
      try {
        result = await this.postToTeams(payload);
      } catch (error1) {
        self.logger.error(JSON.stringify(error1), self.loggingOptions);
      }

      if (Array.isArray(result)) {
        result.forEach(async (record) => {
          self.counter += 1;
          await self.addData(record);
        });
      } else {
        self.counter += 1;
        await self.addData(result);
      }

      return callback(null);
    } catch (error) {
      // return callback(error);
      return callback(null);
    }
  }
}

module.exports = {
  TeamsStream,
};
