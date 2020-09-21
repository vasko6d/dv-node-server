# dv-node-server: [D]avid [V]asko Node Server

## Setup
* <code>npm install</code>
* <code>npm run start</code>

## Purpose
1) Create a proxy server to make use of www.8a.nu/api API endpoints

## Using as a scraper
Currently I am unable to properly authenticate with my proxy server through 8a's keycloak authentication process. For now I am using this proxy,
to allow rapid fetching of my friends and my JSON scorecards. I will host them like I used to with the old 8a to give a "snapshot". To run, start the proxy server locally then, simply run:
```
python3 ./src/python-scraper/scraper.py --out_dir "./out-json" "s%3AV1sg8i3N3DkBBHinEQITur2T4xgOX_nY.gaGHVT9COZwUkWIVrPYe6M3W3lnhEDSR7%2BQKlBb1plE" "david-vasko,alan-nalitch,zev-fineman,kody-shutt,fanny-dong,dirk-irector,chris-rush,chris-hoss-99e8l,l-i-b,natalie-udelarms,scooter-limb"
```