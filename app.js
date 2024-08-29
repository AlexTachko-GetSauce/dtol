const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = 4100;

const cors = require('cors');
const dd = require('@datadog/datadog-api-client');
app.options('*', cors()); // include before other routes

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, (error) => {
  if (!error) {
    console.log('Server is Successfully Running on 3000');
  } else console.log("Error occurred, server can't start", error);
});

app.get('/', (req, res) => {
  res.send('App is running..');
});
const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
console.log('DD_API_KEY', DD_API_KEY);
console.log('DD_APP_KEY', DD_APP_KEY);
const DD_SITE = 'us3.datadoghq.com';

const configuration = dd.client.createConfiguration({
  authMethods: {
    apiKeyAuth: DD_API_KEY,
    appKeyAuth: DD_APP_KEY,
  },
  enableRetry: true,
  maxRetries: 10,
});
configuration.setServerVariables({
  site: DD_SITE,
});
const apiEventsInstance = new dd.v2.EventsApi(configuration);
const apiLogsInstance = new dd.v2.LogsApi(configuration);
const req_limit = 500;

app.get('/ddevents', async (req, res) => {
  console.log('ddevents');
  const logs = await apiEventsInstance.searchEventsWithPagination(
    { body: { query: 'Checkout' } },
    {}
  );
  const logsJson = JSON.stringify(logs);

  res.setHeader('access-control-allow-origin', '*');
  //   headers: {
  //     'access-control-allow-origin': '*'
  //  }
  res.json({ logsJson });
  // res.send({ body: req.body });
});

app.get('/ddupdates', async (req, res) => {
  console.log('ddupdates');
  const params = {
    body: {
      filter: {
        // "query": "@http.url_details.path:\/api\/orders\/v1\/storefront\/orders\/*\/pay",
        // query: 'Checkout click env:production',
        query:
          '@type:http-outgoing env:production service:StorefrontNextJSService source:browser @http.url_details.path:(/api/orders/v1/storefront/orders/create OR /api/orders/v1/storefront/orders/*/fulfillment-info/update OR /api/orders/v1/storefront/orders/*/tips/update OR /api/orders/v1/storefront/orders/*/discount-coupon/update OR /api/orders/v1/storefront/orders/*/redeemed-gifts/update OR /api/orders/v1/storefront/orders/*/redeemed-credits/update)',
        from: 'now-1h',
      },
      sort: 'timestamp',
      page: {
        limit: req_limit,
      },
    },
  };
  const logs = await apiLogsInstance.listLogs(params);
  const logsJson = JSON.stringify(logs);

  res.setHeader('access-control-allow-origin', '*');
  res.json({ logsJson });
  // res.send({ body: req.body });
});
app.get('/ddlogs', async (req, res) => {
  console.log('ddlogs');
  const params = {
    body: {
      filter: {
        query: 'Checkout click env:production',
        from: 'now-1h',
        // to: '2020-09-17T12:48:36+01:00',
      },
      sort: 'timestamp',
      page: {
        limit: req_limit,
      },
    },
  };
  const payparams = {
    body: {
      filter: {
        // query: '@http.url_details.path:/api/orders/v1/storefront/orders/*/pay',
        query:
          '@type:http-outgoing env:production service:StorefrontNextJSService source:browser @http.url_details.path:/api/orders/v1/storefront/orders/*/pay',

        from: 'now-1h',
      },
      sort: 'timestamp',
      page: {
        limit: req_limit,
      },
    },
  };

  const logs = await apiLogsInstance.listLogs(params);
  const paylogs = await apiLogsInstance.listLogs(payparams);
  const mappedLogs = logs?.data.map((log) => {
    const fees = log?.attributes.attributes.data.fees ?? [];
    const deliveryFees = fees.filter(
      (el) => el.type === 'DeliveryFee' || el.type === 'SmallOrderFee'
    );
    const totals = log?.attributes.attributes.data.orderTotals;
    const deliveryFee = deliveryFees.length
      ? deliveryFees.reduce((acc, el) => acc + el.amount, 0)
      : 0;

    const taxesAndFees = deliveryFee
      ? totals.tax + totals.fees - deliveryFee
      : totals.tax + totals.fees;

    return {
      date: log?.attributes.attributes.date,
      data: log?.attributes.attributes.data,
      orderId: log?.attributes.attributes.orderId,
      session_id: log?.attributes.attributes.session_id,
      customSessionId: log?.attributes.attributes.customSessionId,
      itemsNumber: log?.attributes.attributes.itemsNumber,
      location: log?.attributes.attributes.location,
      // items: log?.attributes.attributes.items,
      timestamp: log?.attributes.timestamp,
      isPaid: 'false',
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      taxesAndFees: Math.round(taxesAndFees * 100) / 100,
    };
  });
  const unique = {};
  mappedLogs.forEach((log) => {
    if (!unique[log.session_id]) {
      unique[log.session_id] = log;
    } else {
      if (unique[log.session_id].timestamp < log.timestamp) {
        unique[log.session_id] = log;
      }
    }
  });
  paylogs.data.forEach((paylog) => {
    if (unique[paylog.attributes.attributes.session_id]) {
      unique[paylog.attributes.attributes.session_id].isPaid = 'true';
    }
  });

  const array = Object.values(unique);
  const logsJson = JSON.stringify(array);

  res.setHeader('access-control-allow-origin', '*');
  //   headers: {
  //     'access-control-allow-origin': '*'
  //  }
  res.json({ logsJson });
  // res.send({ body: req.body });
});

// app.use('/.netlify/functions/api', router);
// module.exports.handler = serverless(app);
