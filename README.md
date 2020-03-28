# node-percipio-teamswebhook

This package downloads available content from your Percipio site, transform the returned JSON using JSONata and posts as a message cards to Teams via
an [Incoming Webhook](https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook#add-an-incoming-webhook-to-a-teams-channel)

## Requirements

1. A Skillsoft [Percipio](https://www.skillsoft.com/platform-solution/percipio/) Site
1. A [Percipio Service Account](https://documentation.skillsoft.com/en_us/pes/3_services/service_accounts/pes_service_accounts.htm) with permission for accessing [CONTENT DISCOVERY API](https://documentation.skillsoft.com/en_us/pes/2_understanding_percipio/rest_api/pes_rest_api.htm)

## Environment Configuration

Once you have copied this repository set the following NODE ENV variables:

| ENV      | Required | Description                                                                                                                                                                                                                                          |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORGID    | Required | This is the Percipio Organiation UUID for your Percipio Site                                                                                                                                                                                         |
| BEARER   | Required | This is the Percipio Bearer token for a Service Account with permissions for CONTENT DISCOVERY services.                                                                                                                                             |
| TEAMSURL | Required | This is the incoming webhook for your teams channel. See [Incoming Webhooks Documentation](https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook#add-an-incoming-webhook-to-a-teams-channel). |
| CONFIG   | Optional | This is the configuration to use, this name is used to get the correct `config/config.{config}.js`. If not specified defaults to `default`                                                                                                           |

## How to use it

Make the config changes in the appropriate `config/config.{config}.js` file, to specify any additional request criteria for the [catalog-content API call](https://api.percipio.com/content-discovery/api-docs/#/Content/getCatalogContent). See the comments in the file.

Create a [JSONata](https://github.com/jsonata-js/jsonata) transform with name `transform/{config}.jsonata` to convert the Percipio JSON to a [Message Card](https://docs.microsoft.com/en-us/outlook/actionable-messages/message-card-reference).

The example configurations:

| File                                | Description                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| [default](config/config.default.js) | This config requests all content types with the exception of videos for teh previous 24 hours |

Run the app

```bash
npm start
```

## Transform Examples

| File                                 | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| [default](transform/default.jsonata) | This creates a basic messagecard, with a link to launch the content |

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information what has changed recently.
