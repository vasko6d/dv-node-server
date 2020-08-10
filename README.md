# dv-node-server: [D]avid [V]asko Node Server

## Setup
* <code>npm install</code>
* <code>npm run start</code>

## Purpose
1) Create a proxy server to make use of www.8a.nu/api API endpoints

## Using as a scraper
Currently I am unable to properly authenticate with my proxy server through 8a's keycloak authentication process. For now I am using this proxy,
to allow rapid fetching of my friends and my JSON scorecards. I will host them like I used to with the old 8a to give a "snapshot". To run simply do:
```
python3 ./src/python-scraper/scraper.py --out_dir "./out-json" "s%3AjvhnwvhnyCE1tSDbxe-dGm7SPUEPxj-J.hRvgnF%2Fpmvnpyvel3%2Bu2%2BHrNn2u99uQXZglX0bMyynU" "david-vasko,alan-nalitch,zev-fineman,kody-shutt,fanny-dong,dirk-irector,chris-rush,chris-hoss-99e8l,l^C-b,natalie-udelarms,scooter-limb
```