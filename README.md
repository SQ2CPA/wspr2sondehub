# wspr2sondehub

## Installation

1. Install NodeJS v20 (you can use https://github.com/nvm-sh/nvm)

2. Install required dependencies `npm install`

3. Edit your details in `settings.json`. You will find some examples in `settings.example.json`.

4. Run your script by `npm run start`

Upload to APRSIS is currently not supported.

Uploading listeners to sondehub is also disabled.

## How to add into crontab? (run every 5 minutes)

1. Check your NPM binary path by `which npm`
2. Add new line into `crontab -e`

`*/5 * * * * cd /home/sq2cpa/wspr2sondehub/ && /home/sq2cpa/.nvm/versions/node/v20.15.0/bin/npm run start`

First path (`/home/sq2cpa/wspr2sondehub/`) is your `wspr2sondehub` directory
Second path (`/home/sq2cpa/.nvm/versions/node/v20.15.0/bin/npm`) is the `npm` path from `which npm`

# 73, Damian SQ2CPA, Poland
