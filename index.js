// Options
var options = {
    port: process.env.PORT || 80, // Heroku port or 80.
    unityAPIBase: 'https://build-api.cloud.unity3d.com', // URI (e.g. href) recieved in web hook payload.
    unityCloudAPIKey: process.env.UNITYCLOUD_KEY,
    unityCloudSecret: process.env.UNITYCLOUD_SECRET,
    hockeyAppHost: 'rink.hockeyapp.net',
    hockeyAppProtocol: 'https:',
    hockeyappAPIKey: process.env.HOCKEYAPP_KEY,
    logLevel: process.env.LOG_LEVEL || 0
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

// Run Server
server.listen(options.port, function () {
    console.log('listening on *:' + options.port);
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
                console.log('Signature OK');
            }
        }
    }
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/build', jsonParser, function (req, res) {
    if (!req.body) {
        return res.sendStatus(400);
    }

    console.log(req.body);

    // Get Build API URL
    var buildAPIURL = req.body.links.api_self.href;
    if (!buildAPIURL) {
        // URL not available.
        res.setHeader('Content-Type', 'application/json');
        res.send({
            error: true,
            message: 'No build link from Unity Cloud Build webhook'
        });
    } else {
        // URL available.
        res.setHeader('Content-Type', 'application/json');
        res.send({
            error: false,
            message: 'Process begun for project "' + req.body.projectName + '" platform "' + req.body.buildTargetName + '".'
        });
    }

    getBuildDetails(buildAPIURL)
        .then(({ url, filename }) => downloadBinary(url, filename))
        .then((filename) => uploadToHockeyApp(filename, req.body.platform, req.query.appId, req.query.teams));
});

function getBuildDetails (buildAPIURL) {
    console.log('getBuildDetails: start');

    return new Promise((resolve, reject) =>
        najax({
            url: options.unityAPIBase + buildAPIURL,
            type: 'GET',
            headers: {
                'Authorization': 'Basic ' + options.unityCloudAPIKey
            },
            success: function (data) {
                var parsedData = JSON.parse(data);

                var parsedUrl = url.parse(parsedData.links.download_primary.href);
                var filename = '/tmp/' + path.basename(parsedUrl.pathname);

                console.log('getBuildDetails: finished');

                resolve({url: parsedData.links.download_primary.href, filename: filename});
            },
            error: function (error) {
                console.log(error);
                reject(error);
            }
        })
    );
}

function downloadBinary (binaryURL, filename) {
    console.log('downloadBinary: start');
    console.log('   ' + binaryURL);
    console.log('   ' + filename);

    return new Promise((resolve, reject) =>
        deleteFile(filename, () =>
            https.get(binaryURL, (res) => {
                console.log('statusCode: ', res.statusCode);
                console.log('headers: ', res.headers);

                var writeStream = fs.createWriteStream(filename, {'flags': 'a'});

                var len = parseInt(res.headers['content-length'], 10);
                var cur = 0;
                var total = len / 1048576; // 1048576 - bytes in  1Megabyte

                res.on('data', (chunk) => {
                    cur += chunk.length;
                    writeStream.write(chunk, 'binary');

                    if (options.logLevel >= 1) {
                        console.log('Downloading ' + (100.0 * cur / len).toFixed(2) + '%, Downloaded: ' + (cur / 1048576).toFixed(2) + ' mb, Total: ' + total.toFixed(2) + ' mb');
                    }
                });

                res.on('end', () => {
                    console.log('downloadBinary: finished');
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

function uploadToHockeyApp (filename, platform, appId, teams) {
    if (platform === 'android' || platform === 'ios') {
        return uploadFileToHockeyApp(filename, teams);
    } else {
        return getHockeyAppVersion(appId)
            .then((version) => createHockeyAppVersion(appId, version + 1))
            .then((versionId) => updateHockeyAppVersion(appId, versionId, filename, teams));
    }
}

function getHockeyAppVersion (appId) {
    console.log('getHockeyAppVersion: start');
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

                console.log('getHockeyAppVersion: finished');
                resolve(version);
            },
            error: function (error) {
                console.log(error);
                reject(error);
            }
        })
    );
}

function createHockeyAppVersion (appId, version) {
    console.log('createHockeyAppVersion: start');
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
                console.log(err);
                reject(err);
            }

            var body = '';

            res.on('data', (chunk) => { body += chunk; });

            res.on('end', () => {
                var parsedData = JSON.parse(body);
                console.log('createHockeyAppVersion: finished');
                resolve(parsedData.id);
            });
        })
    );
}

function updateHockeyAppVersion (appId, versionId, filename, teams) {
    console.log('updateHockeyAppVersion: start');

    var readable = fs.createReadStream(filename);
    readable.on('error', () => {
        console.log('Error reading binary file for upload to HockeyApp');
    });

    // HockeyApp properties
    var HOCKEY_APP_PATH = '/api/2/apps/' + appId + '/app_versions/' + versionId;

    // Create FormData
    var form = new FormData();
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
                console.log(err);
                reject(err);
            }

            if (res.statusCode !== 200 && res.statusCode !== 201) {
                console.log('Uploading failed with status ' + res.statusCode);
                console.log(res);
                reject(err);
            }

            var jsonString = ''; // eslint-disable-line
            res.on('data', (chunk) => {
                jsonString += String.fromCharCode.apply(null, new Uint16Array(chunk));
            });

            res.on('end', () => {
                console.log('updateHockeyAppVersion: finished');
                deleteFile(filename, resolve);
            });
        })
    );
}

function uploadFileToHockeyApp (filename, teams) {
    console.log('uploadToHockeyApp: start');

    var readable = fs.createReadStream(filename);
    readable.on('error', () => {
        console.log('Error reading binary file for upload to HockeyApp');
    });

    // HockeyApp properties
    var HOCKEY_APP_PATH = '/api/2/apps/upload/';

    // Create FormData
    var form = new FormData();
    form.append('status', 2);
    // form.append('mandatory', MANDATORY_TYPE[options.mandatory]);
    form.append('notes', 'Automated release triggered from Unity Cloud Build.');
    form.append('notes_type', 0);
    form.append('notify', 0);
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
                console.log(err);
                reject(err);
            }

            if (res.statusCode !== 200 && res.statusCode !== 201) {
                console.log('Uploading failed with status ' + res.statusCode);
                reject(err);
            }

            var jsonString = ''; // eslint-disable-line
            res.on('data', (chunk) => {
                jsonString += String.fromCharCode.apply(null, new Uint16Array(chunk));
            });

            res.on('end', () => {
                console.log('uploadToHockeyApp: finished');

                deleteFile(filename, resolve);
            });
        });

        // Track upload progress.
        var len = parseInt(req.getHeader('content-length'), 10);
        var cur = 0;
        var total = len / 1048576; // 1048576 - bytes in  1Megabyte

        req.on('data', (chunk) => {
            cur += chunk.length;
            if (options.logLevel >= 1) {
                console.log('Downloading ' + (100.0 * cur / len).toFixed(2) + '%, Downloaded: ' + (cur / 1048576).toFixed(2) + ' mb, Total: ' + total.toFixed(2) + ' mb');
            }
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
                    console.log(err);
                }

                cb();
            });
        } else {
            cb();
        }
    });
}
