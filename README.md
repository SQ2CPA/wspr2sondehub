# wspr2sondehub

## READ THIS FIRST

Please run this wspr2sondehub script ONLY for balloons that you own or you have permission from the owner! Otherwise you will cause duplicates and loss of data because you don't have required details! Thanks!

## Features

Of cource the main feature is to upload data from WSPR spots to SondeHub Amateur but it also:

-   Supports traquito and zachtek
-   Supports multiple timeslots (like for example 4 6 and 0 8)
-   Supports uploading to APRSIS
-   Supports uploading receivers locations [disabled for now because of sondehub dev request]

I also want to implement soon:

-   Supports incomplete frames merge (for example we could get only second frame for zachtek but that already contains the location so we can show that on the map)

## Installation

1. Install NodeJS v20 (you can use https://github.com/nvm-sh/nvm)

2. Install required dependencies `npm install`

3. Edit your details in `settings.json`. You will find some examples in `settings.example.json`.

4. Run your script by `npm run start`

## How to add into crontab? (run every 5 minutes)

1. Check your NPM binary path by `which npm`
2. Add new line into `crontab -e`

`*/5 * * * * cd /home/USERNAME/wspr2sondehub/ && /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm run start`

First path (`/home/USERNAME/wspr2sondehub/`) is your `wspr2sondehub` directory
Second path (`/home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm`) is the `npm` path from `which npm`

You can also link your `node` and `npm` binaries from `nvm` binaries directly using

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/node /usr/bin/node`

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm /usr/bin/npm`

where paths are from `which node` and `which nvm` after using `nvm use v20`
Then you don't need to use aboslute paths in crontab, you can just use `node` or `nvm`

# 73, Damian SQ2CPA, Poland
