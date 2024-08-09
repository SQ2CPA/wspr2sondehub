# wspr2sondehub

## READ THIS FIRST

Please run this wspr2sondehub script ONLY for balloons that you own or you have permission from the owner! Otherwise you will cause duplicates and loss of data because you don't have required details! Thanks!

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

`*/5 * * * * cd /home/USERNAME/wspr2sondehub/ && /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm run start`

First path (`/home/USERNAME/wspr2sondehub/`) is your `wspr2sondehub` directory
Second path (`/home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm`) is the `npm` path from `which npm`

You can also link your `node` and `npm` binaries from `nvm` binaries directly using

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/node /usr/bin/node`

`ln -s /home/USERNAME/.nvm/versions/node/v20.15.0/bin/npm /usr/bin/npm`

where paths are from `which node` and `which nvm` after using `nvm use v20`
Then you don't need to use aboslute paths in crontab, you can just use `node` or `nvm`

# 73, Damian SQ2CPA, Poland
