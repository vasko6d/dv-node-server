import express from 'express';
import axios from 'axios';

const app = express();
const port = 8080; // default port to listen
const eightaUrl = 'https://www.8a.nu/api';
const getAscentHeaders = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'upgrade-insecure-requests': '1',
};

app.get('/:sid/:userId', (req, res) => {
  // eslint-disable-next-line no-console
  console.log(`Request Path: ${req.url}`);
  axios.request({
    url: `${eightaUrl}/users/${req.params.userId}/ascents?category=bouldering&pageIndex=0&pageSize=0`,
    headers: {
      ...getAscentHeaders,
      cookie: `connect.sid=${req.params.sid}`,
    },
    method: 'GET',
  }).then((resp) => {
    axios.request({
      url: `${eightaUrl}/users/${req.params.userId}/ascents?category=bouldering&pageIndex=0&pageSize=${resp.data.totalItems}`,
      headers: {
        ...getAscentHeaders,
        cookie: `connect.sid=${req.params.sid}`,
      },
    }).then((allAscentResp) => {
      res.send(allAscentResp.data);
    });
  }).catch((e) => {
    res.send({ statusCode: 500, error: e });
  });
});

// start the Express server
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`server started at http://localhost:${port}`);
});
