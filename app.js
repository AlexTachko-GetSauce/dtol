const express = require('express');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const app = express();
const PORT = 4100;

const cors = require('cors');
const dd = require('@datadog/datadog-api-client');
app.options('*', cors()); // include before other routes

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, (error) => {
  if (!error) {
    console.log(`Server is Successfully Running on ${PORT}`);
  } else console.log("Error occurred, server can't start", error);
});

function formatTimestamp(timestamp) {
  const date = new Date(timestamp); // Create a Date object from the timestamp

  const year = date.getFullYear(); // Get full year
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Get month (0-based) and pad with leading zero
  const day = String(date.getDate()).padStart(2, '0'); // Get day and pad with leading zero

  const hours = String(date.getHours()).padStart(2, '0'); // Get hours and pad with leading zero
  const minutes = String(date.getMinutes()).padStart(2, '0'); // Get minutes and pad with leading zero

  return `${year}-${month}-${day}, ${hours}:${minutes}`; // Return formatted date string
}

app.get('/', (req, res) => {
  res.send('App is running..');
});
const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
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
const req_limit = 5000;

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
        // query: '@http.url_details.path:/api/orders/v1/storefront/orders/*/pay',
        // query: 'Checkout click env:production',
        query:
          '@type:http-outgoing env:production service:StorefrontNextJSService source:browser @http.url_details.path:(/api/orders/v1/storefront/orders/create OR /api/orders/v1/storefront/orders/*/fulfillment-info/update OR /api/orders/v1/storefront/orders/*/tips/update OR /api/orders/v1/storefront/orders/*/discount-coupon/update OR /api/orders/v1/storefront/orders/*/redeemed-gifts/update OR /api/orders/v1/storefront/orders/*/redeemed-credits/update OR /api/orders/v1/storefront/orders/*/pay)',
        from: 'now-24h',
      },
      sort: '-timestamp',
      page: {
        limit: req_limit,
      },
    },
  };
  const logs = await apiLogsInstance.listLogs(params);
  const mappedLogs = logs?.data.map((log) => {
    const attributes = log?.attributes.attributes;
    const resBody = JSON.parse(attributes.res.body);
    const fees = resBody.fees ?? [];
    const deliveryFees = fees.filter(
      (el) => el.type === 'DeliveryFee' || el.type === 'SmallOrderFee'
    );
    const totals = resBody.totals;
    const deliveryFee = deliveryFees.length
      ? deliveryFees.reduce((acc, el) => acc + el.amount, 0)
      : 0;

    const taxesAndFees = deliveryFee
      ? totals.tax + totals.fees - deliveryFee
      : totals.tax + totals.fees;

    return {
      keys: Object.keys(log?.attributes.attributes).join(', '),
      // res: Object.keys(attributes.res.body).join(', '),
      customSessionId: attributes.customSessionId,
      date: formatTimestamp(attributes.date),
      session_id: attributes.session_id,
      orderId: resBody.id,
      locationId: resBody.location?.id,
      locationName: resBody.location?.name,
      tips: resBody.tips,
      totals: resBody.totals,
      type: resBody.type,
      itemsNumber: resBody.cart?.items?.length,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      taxesAndFees: Math.round(taxesAndFees * 100) / 100,
    };
  });
  // const logsJson = JSON.stringify(mappedLogs);

  res.setHeader('access-control-allow-origin', '*');
  res.json({
    // logsJson,
    attributes: logs?.data[0].attributes.attributes,
    first: JSON.parse(logs?.data[0].attributes.attributes.res.body),
    mappedLogs,
  });
  // res.send({ body: req.body });
});
app.get('/ddpupdates', async (req, res) => {
  console.log('ddpupdates');
  console.time('Download Logs Time');
  const hours = req.query.hours;
  const from = req.query.from;
  const to = req.query.to;
  const mappedLogsObj = await getData(hours, from, to);
  // const from = isNaN(Number(hours)) ? 'now-24h' : `now-${hours}h`;
  // const params = {
  //   body: {
  //     filter: {
  //       // "query": "@http.url_details.path:\/api\/orders\/v1\/storefront\/orders\/*\/pay",
  //       // query: 'Checkout click env:production',
  //       query:
  //         '@type:http-outgoing env:production service:StorefrontNextJSService source:browser @http.url_details.path:(/api/orders/v1/storefront/orders/create OR /api/orders/v1/storefront/orders/*/fulfillment-info/update OR /api/orders/v1/storefront/orders/*/tips/update OR /api/orders/v1/storefront/orders/*/discount-coupon/update OR /api/orders/v1/storefront/orders/*/redeemed-gifts/update OR /api/orders/v1/storefront/orders/*/redeemed-credits/update OR /api/orders/v1/storefront/orders/*/pay) status:info',
  //       from: from,
  //     },
  //     sort: '-timestamp',
  //     page: {
  //       limit: req_limit,
  //     },
  //   },
  // };

  // const mappedLogsObj = {};

  // for await (const logg of apiLogsInstance.listLogsWithPagination(params)) {
  //   const attributes = logg?.attributes?.attributes;
  //   if (
  //     !mappedLogsObj[attributes.session_id] ||
  //     mappedLogsObj[attributes.session_id].date < attributes.date
  //   ) {
  //     const resBody = JSON.parse(attributes.res.body);
  //     const fees = resBody.fees ?? [];
  //     const deliveryFees = fees.filter(
  //       (el) => el.type === 'DeliveryFee' || el.type === 'SmallOrderFee'
  //     );

  //     const totals = resBody.totals;
  //     let deliveryFee = 0;
  //     let taxesAndFees = 0;
  //     let noDeliveryFees = 0;
  //     if (!totals || !deliveryFees) {
  //       console.log(resBody);
  //     } else {
  //       deliveryFee = deliveryFees.length
  //         ? deliveryFees.reduce((acc, el) => acc + el.amount, 0)
  //         : 0;

  //       noDeliveryFees = deliveryFee ? totals.fees - deliveryFee : totals.fees;
  //       taxesAndFees = deliveryFee
  //         ? totals.tax + totals.fees - deliveryFee
  //         : totals.tax + totals.fees;
  //     }

  //     const isPaid = attributes.http.url.endsWith('pay') ? 'true' : 'false';
  //     const isCreate = attributes.http.url.endsWith('create')
  //       ? 'true'
  //       : 'false';
  //     mappedLogsObj[attributes.session_id] = {
  //       // keys: Object.keys(log?.attributes.attributes).join(', '),
  //       // res: Object.keys(attributes.res.body).join(', '),
  //       customSessionId: attributes.customSessionId,
  //       date: attributes.date,
  //       timestamp: attributes.date,
  //       session_id: attributes.session_id,
  //       orderId: resBody.id,
  //       locationId: resBody.location?.id,
  //       locationName: resBody.location?.name,
  //       tips: resBody.tips,
  //       totals: resBody.totals,
  //       type: resBody.type,
  //       itemsNumber: resBody.cart?.items?.length,
  //       isPaid: isPaid,
  //       isCreate: isCreate,
  //       noDeliveryFees: Math.round(noDeliveryFees * 100) / 100,
  //       deliveryFee: Math.round(deliveryFee * 100) / 100,
  //       taxesAndFees: Math.round(taxesAndFees * 100) / 100,
  //     };
  //   }
  // }

  // const logs = await apiLogsInstance.listLogs(params);
  // const mappedLogs = logs?.data.map((log) => {
  //   const attributes = log?.attributes.attributes;
  //   const resBody = JSON.parse(attributes.res.body);
  //   return {
  //     // keys: Object.keys(log?.attributes.attributes).join(', '),
  //     // res: Object.keys(attributes.res.body).join(', '),
  //     customSessionId: attributes.customSessionId,
  //     date: attributes.date,
  //     session_id: attributes.session_id,
  //     orderId: resBody.id,
  //     locationId: resBody.location?.id,
  //     locationName: resBody.location?.name,
  //     tips: resBody.tips,
  //     totals: resBody.totals,
  //     type: resBody.type,
  //     itemsNumber: resBody.cart?.items?.length,
  //   };
  // });
  // const logsJson = JSON.stringify(mappedLogs);
  console.timeEnd('Download Logs Time');
  console.log('mappedData length', Object.values(mappedLogsObj).length);

  res.setHeader('access-control-allow-origin', '*');
  res.json({
    // logsJson,
    // attributes: logs?.data[0].attributes.attributes,
    // first: JSON.parse(logs?.data[0].attributes.attributes.res.body),
    mappedLogs: Object.values(mappedLogsObj),
  });
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

const getData = async (hours, fromInput, toInput) => {
  const from = isNaN(Number(hours)) ? 'now-12h' : `now-${hours}h`;
  // const reqFrom = from;
  // const to = toInput;
  // const to = 'now-24h';
  // const prefix = (date) => (date > 9 ? '' : '0');
  // const from = `2024-09-${prefix(Number(hours))}${Number(
  //   hours
  // )}T00:00:00+00:00`;
  // const to = `2024-09-${prefix(Number(hours) + 1)}${
  //   Number(hours) + 1
  // }T00:00:00+00:00`;
  console.log('from, to', fromInput, toInput);

  const reqFrom = fromInput
    ? fromInput
    : isNaN(Number(hours))
    ? 'now-12h'
    : `now-${hours}h`;
  const reqTo = toInput ? toInput : 'now';
  console.log('reqFrom, reqTo', reqFrom, reqTo);

  const params = {
    body: {
      filter: {
        // "query": "@http.url_details.path:\/api\/orders\/v1\/storefront\/orders\/*\/pay",
        // query: 'Checkout click env:production',
        query:
          '@type:http-outgoing env:production service:StorefrontNextJSService source:browser @http.url_details.path:(/api/orders/v1/storefront/orders/create OR /api/orders/v1/storefront/orders/*/fulfillment-info/update OR /api/orders/v1/storefront/orders/*/tips/update OR /api/orders/v1/storefront/orders/*/discount-coupon/update OR /api/orders/v1/storefront/orders/*/redeemed-gifts/update OR /api/orders/v1/storefront/orders/*/redeemed-credits/update OR /api/orders/v1/storefront/orders/*/pay) status:info',
        from: reqFrom,
        // to: reqTo,
        // from: from,
        // to: to,
      },
      sort: '-timestamp',
      page: {
        limit: req_limit,
      },
    },
  };

  const mappedLogsObj = {};
  for await (const logg of apiLogsInstance.listLogsWithPagination(params)) {
    const attributes = logg?.attributes?.attributes;
    if (
      !mappedLogsObj[attributes.session_id] ||
      mappedLogsObj[attributes.session_id].date < attributes.date
    ) {
      // console.log('session_id', attributes.session_id);
      const resBody = JSON.parse(attributes.res.body);
      // if (resBody.delivery !== null) {
      //   console.log(resBody);
      // }
      const fees = resBody.fees ?? [];
      const deliveryFees = fees.filter(
        (el) => el.type === 'DeliveryFee' || el.type === 'SmallOrderFee'
      );

      const totals = resBody.totals;
      let deliveryFee = 0;
      let taxesAndFees = 0;
      let noDeliveryFees = 0;
      if (!totals || !deliveryFees) {
        // console.log(resBody);
      } else {
        deliveryFee = deliveryFees.length
          ? deliveryFees.reduce((acc, el) => acc + el.amount, 0)
          : 0;

        noDeliveryFees = deliveryFee ? totals.fees - deliveryFee : totals.fees;
        taxesAndFees = deliveryFee
          ? totals.tax + totals.fees - deliveryFee
          : totals.tax + totals.fees;
      }
      const dfeesString = deliveryFees
        .map(({ type, amount }) => `${type}: ${amount}`)
        .join(', ');
      // const dFeesArray = (deliveryFees ?? []).map(({type, amount}) => {type, amount})

      const isPaid = attributes.http.url.endsWith('pay') ? 'true' : 'false';
      const isCreate = attributes.http.url.endsWith('create')
        ? 'true'
        : 'false';
      const hasDeliverySet = !!resBody?.delivery?.dropOff?.address;
      // if (hasDeliverySet) {
      //   console.log(
      //     'attributes?.delivery?.dropOff?.address',
      //     resBody?.delivery?.dropOff?.address
      //   );
      // }
      mappedLogsObj[attributes.session_id] = {
        keys: Object.keys(attributes).join(', '),
        // res: Object.keys(attributes.res.body).join(', '),
        customSessionId: attributes.customSessionId,
        date: formatTimestamp(attributes.date),
        timestamp: attributes.date,
        session_id: attributes.session_id,
        orderId: resBody.id,
        locationId: resBody.location?.id,
        locationName: resBody.location?.name,
        tips: resBody.tips,
        totals: resBody.totals,
        type: resBody.type,
        itemsNumber: resBody.cart?.items?.length,
        isPaid: isPaid,
        isCreate: isCreate,
        noDeliveryFees: Math.round(noDeliveryFees * 100) / 100,
        deliveryFee: Math.round(deliveryFee * 100) / 100,
        deliveryFees: dfeesString,
        hasDeliverySet,
        taxesAndFees: Math.round(taxesAndFees * 100) / 100,
      };
    }
  }
  return mappedLogsObj;
};

app.get('/ddpupdates-excel', async (req, res) => {
  console.log('ddpupdates-excel');
  console.time('Download Excel Time');
  const hours = req.query.hours;
  const from = req.query.from;
  const to = req.query.to;
  console.log('req.query', req.query);
  const data = await getData(hours, from, to);
  const mappedData = Object.values(data).map((row) => ({
    'Location name': row.locationName,
    'Location id': row.locationId,
    Paid: row.isPaid,
    'create only': row.isCreate,
    Items: row.itemsNumber,
    Subtotal: row.totals.subtotal,
    Discount: row.totals.discount,
    'Delivery fee': row.deliveryFee,
    'Fees (except delivery)': row.noDeliveryFees,
    deliveryFees: row.deliveryFees,
    'Has set delivery': row.hasDeliverySet,
    Taxes: row.totals.tax,
    'Taxes and fees': row.taxesAndFees,
    Tips: row.totals.tips,
    Total: row.totals.total,
    Type: row.type,
    'Order Id': row.orderId,
    date: row.date,
  }));
  console.log('mappedData length', mappedData.length);

  const worksheet = XLSX.utils.json_to_sheet(mappedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Events');
  const excelBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });
  console.timeEnd('Download Excel Time');

  // Set headers to prompt file download
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=filtered-data.xlsx'
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  res.setHeader('access-control-allow-origin', '*');
  return res.send(excelBuffer);
  // res.json({
  //   mappedLogs: Object.values(data),
  // });
  // res.send({ body: req.body });
});
