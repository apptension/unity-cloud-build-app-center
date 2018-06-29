// Options
var options = {
    port: process.env.PORT || 80, // Heroku port or 80.
    unityAPIBase: 'https://build-api.cloud.unity3d.com', // URI (e.g. href) recieved in web hook payload.
    unityCloudAPIKey: process.env.UNITYCLOUD_KEY,
    unityCloudSecret: process.env.UNITYCLOUD_SECRET,
    hockeyAppHost: 'rink.hockeyapp.net',
    hockeyAppProtocol: 'https:',
    hockeyappAPIKey: process.env.HOCKEYAPP_KEY,
    logLevel: process.env.LOG_LEVEL || 'info'
};

// Imports
var path = require('path');
var fs = require('fs');
var express = require('express');
var app = express();
var http = require('http');
var https = require('https');
var server = http.Server(app);
var bodyParser = require('body-parser');
var najax = require('najax');
var FormData = require('form-data');
var url = require('url');
var HmacSHA256 = require('crypto-js/hmac-sha256');
var winston = require('winston');

// Setup logging
const logger = winston.createLogger({
    level: options.logLevel,
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.align(),
                winston.format.splat(),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
            )
        })
    ]
});

// Run Server
server.listen(options.port, function () {
    logger.info('listening on *:' + options.port);
});

// Configure Express
app.use('/public', express.static('public'));

// parse application/json
var jsonParser = bodyParser.json({
    verify: function (req, res, buf, encoding) {
        if (options.unityCloudSecret) {
            var content = buf.toString();
            var actualHmac = HmacSHA256(content, options.unityCloudSecret).toString();

            var hmac = req.headers['x-unitycloudbuild-signature'];

            if (hmac !== actualHmac) {
                throw new Error('Invalid signature');
            } else {
                logger.info('Signature OK');
            }
        }
    }
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/build', jsonParser, async function (req, res) {
    if (!req.body) {
        return res.sendStatus(400);
    }

    logger.info('body: %j', req.body);

    // Get Build API URL
    var buildAPIURL = ((req.body.links || {}).api_self || {}).href;
    if (!buildAPIURL) {
        // URL not available.
        res.setHeader('Content-Type', 'application/json');
        res.send({
            error: true,
            message: 'No build link from Unity Cloud Build webhook'
        });

        logger.warn('No build link provided, ignoring request')

        return;
    } else {
        // URL available.
        res.setHeader('Content-Type', 'application/json');
        res.send({
            error: false,
            message: 'Process begun for project "' + req.body.projectName + '" platform "' + req.body.buildTargetName + '".'
        });
    }

    if (req.query.excludeTargets) {
        var excludedTargets = req.query.excludeTargets.split(',').map((x) => x.trim());
        if (excludedTargets.includes(req.body.buildTargetName)) {
            logger.info('Target "%s" excluded, skipping', req.body.buildTargetName);
            return;
        }
    }

    var { url, filename, notes } = await getBuildDetails(buildAPIURL);
    var downloadedFilename = await downloadBinary(url, filename);
    await uploadToHockeyApp(downloadedFilename, notes, req.body.platform, req.query.appId, req.query.teams);
});

function getBuildDetails (buildAPIURL) {
    logger.info('getBuildDetails: start');

    return new Promise((resolve, reject) =>
        najax({
            url: options.unityAPIBase + buildAPIURL,
            type: 'GET',
            headers: {
                'Authorization': 'Basic ' + options.unityCloudAPIKey
            },
            success: function (data) {
                var parsedData = JSON.parse(data);

                var notes = '';

                if (parsedData.changeset) {
                    notes += 'Commits:\n';

                    for (var commit of parsedData.changeset.reverse()) {
                        notes += `  - [${commit.commitId.substr(0, 8)}] ${commit.message}\n`;
                    }
                }

                var parsedUrl = url.parse(parsedData.links.download_primary.href);
                var filename = '/tmp/' + path.basename(parsedUrl.pathname);

                logger.info('getBuildDetails: finished');

                resolve({url: parsedData.links.download_primary.href, filename: filename, notes: notes});
            },
            error: function (error) {
                logger.error('Error when fetching build details: %j', error);
                reject(error);
            }
        })
    );
}

function downloadBinary (binaryURL, filename) {
    logger.info('downloadBinary: start');
    logger.info('   ' + binaryURL);
    logger.info('   ' + filename);

    return new Promise((resolve, reject) =>
        deleteFile(filename, () =>
            https.get(binaryURL, (res) => {
                logger.info('statusCode: %j', res.statusCode);
                logger.info('headers: %j', res.headers);

                var writeStream = fs.createWriteStream(filename, {'flags': 'a'});

                var len = parseInt(res.headers['content-length'], 10);
                var cur = 0;
                var total = len / 1048576; // 1048576 - bytes in  1Megabyte

                res.on('data', (chunk) => {
                    cur += chunk.length;
                    writeStream.write(chunk, 'binary');

                    logger.debug('Downloading ' + (100.0 * cur / len).toFixed(2) + '%, Downloaded: ' + (cur / 1048576).toFixed(2) + ' mb, Total: ' + total.toFixed(2) + ' mb');
                });

                res.on('end', () => {
                    logger.info('downloadBinary: finished');
                    writeStream.end();
                });

                writeStream.on('finish', () => {
                    resolve(filename);
                });
            }).on('error', (e) => {
                console.error(e);
                reject(e);
            })
        )
    );
}

async function uploadToHockeyApp (filename, notes, platform, appId, teams) {
    if (platform === 'android' || platform === 'ios') {
        return uploadFileToHockeyApp(filename, notes, teams);
    } else {
        var version = await getHockeyAppVersion(appId);
        var versionId = await createHockeyAppVersion(appId, version + 1);
        return updateHockeyAppVersion(appId, versionId, filename, notes, teams);
    }
}

function getHockeyAppVersion (appId) {
    logger.info('getHockeyAppVersion: start');
    var url = options.hockeyAppProtocol + '//' + options.hockeyAppHost + '/api/2/apps/' + appId + '/app_versions';

    return new Promise((resolve, reject) =>
        najax({
            url: url,
            type: 'GET',
            headers: {
                'X-HockeyAppToken': options.hockeyappAPIKey
            },
            success: function (data) {
                var parsedData = JSON.parse(data);

                var version = 0;
                if (parsedData.app_versions.length > 0) {
                    version = parseInt(parsedData.app_versions[0].version);
                }

                logger.info('getHockeyAppVersion: finished');
                resolve(version);
            },
            error: function (error) {
                logger.error('Error when fetching version data: %j', error);
                reject(error);
            }
        })
    );
}

function createHockeyAppVersion (appId, version) {
    logger.info('createHockeyAppVersion: start');
    // HockeyApp properties
    var HOCKEY_APP_PATH = '/api/2/apps/' + appId + '/app_versions/new';

    // Create FormData
    var form = new FormData();
    form.append('bundle_version', version);

    return new Promise((resolve, reject) =>
        form.submit({
            host: options.hockeyAppHost,
            path: HOCKEY_APP_PATH,
            protocol: options.hockeyAppProtocol,
            headers: {
                'Accept': 'application/json',
                'X-HockeyAppToken': options.hockeyappAPIKey
            }
        }, function (err, res) {
            if (err) {
                logger.error('Error when creating version: %j', err);
                reject(err);
            }

            var body = '';

            res.on('data', (chunk) => { body += chunk; });

            res.on('end', () => {
                var parsedData = JSON.parse(body);
                logger.info('createHockeyAppVersion: finished');
                resolve(parsedData.id);
            });
        })
    );
}

function updateHockeyAppVersion (appId, versionId, filename, notes, teams) {
    logger.info('updateHockeyAppVersion: start');

    var readable = fs.createReadStream(filename);
    readable.on('error', () => {
        logger.info('Error reading binary file for upload to HockeyApp');
    });

    // HockeyApp properties
    var HOCKEY_APP_PATH = '/api/2/apps/' + appId + '/app_versions/' + versionId;

    // Create FormData
    var form = new FormData();
    form.append('notes', notes);
    form.append('notes_type', 0);
    form.append('status', 2);
    form.append('ipa', readable);

    if (teams) {
        form.append('teams', teams);
    }

    return new Promise((resolve, reject) =>
        form.submit({
            host: options.hockeyAppHost,
            path: HOCKEY_APP_PATH,
            protocol: options.hockeyAppProtocol,
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'X-HockeyAppToken': options.hockeyappAPIKey
            }
        }, function (err, res) {
            if (err) {
                logger.error('Error when uploading: %j', err);
                reject(err);
            }

            if (res.statusCode !== 200 && res.statusCode !== 201) {
                logger.error('Uploading failed with status ' + res.statusCode);
                logger.error('res: %j', res);
                reject(err);
            }

            var jsonString = ''; // eslint-disable-line
            res.on('data', (chunk) => {
                jsonString += String.fromCharCode.apply(null, new Uint16Array(chunk));
            });

            res.on('end', () => {
                logger.info('updateHockeyAppVersion: finished');
                deleteFile(filename, resolve);
            });
        })
    );
}

function uploadFileToHockeyApp (filename, notes, teams) {
    logger.info('uploadToHockeyApp: start');

    var readable = fs.createReadStream(filename);
    readable.on('error', () => {
        logger.error('Error reading binary file for upload to HockeyApp');
    });

    // HockeyApp properties
    var HOCKEY_APP_PATH = '/api/2/apps/upload/';

    // Create FormData
    var form = new FormData();
    form.append('status', 2);
    form.append('notes', notes);
    form.append('notes_type', 0);
    form.append('ipa', readable);

    if (teams) {
        form.append('teams', teams);
    }

    return new Promise((resolve, reject) => {
        var req = form.submit({
            host: options.hockeyAppHost,
            path: HOCKEY_APP_PATH,
            protocol: options.hockeyAppProtocol,
            headers: {
                'Accept': 'application/json',
                'X-HockeyAppToken': options.hockeyappAPIKey
            }
        }, function (err, res) {
            if (err) {
                logger.error('Error when uploading: %j', err);
                reject(err);
            }

            if (res.statusCode !== 200 && res.statusCode !== 201) {
                logger.info('Uploading failed with status ' + res.statusCode);
                reject(err);
            }

            var jsonString = ''; // eslint-disable-line
            res.on('data', (chunk) => {
                jsonString += String.fromCharCode.apply(null, new Uint16Array(chunk));
            });

            res.on('end', () => {
                logger.info('uploadToHockeyApp: finished');

                deleteFile(filename, resolve);
            });
        });

        // Track upload progress.
        var len = parseInt(req.getHeader('content-length'), 10);
        var cur = 0;
        var total = len / 1048576; // 1048576 - bytes in  1Megabyte

        req.on('data', (chunk) => {
            cur += chunk.length;
            logger.debug('Downloading ' + (100.0 * cur / len).toFixed(2) + '%, Downloaded: ' + (cur / 1048576).toFixed(2) + ' mb, Total: ' + total.toFixed(2) + ' mb');
        });
    });
}

// Delete file, used to clear up any binary downloaded.
function deleteFile (filename, cb) {
    fs.access(filename, function (err) {
        if (!err || err.code !== 'ENOENT') {
            // Delete File.
            fs.unlink(filename, (err) => {
                if (err) {
                    logger.error('Error when deleting file: %j', err);
                }

                cb();
            });
        } else {
            cb();
        }
    });
}
