/**
 *
 * nuki adapter
 *
 *
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
var utils      = require(__dirname + '/lib/utils'); // Get common adapter utils
var express    = require('express');        // call express
var request    = require('request');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = new utils.Adapter('nuki');

// global config variables
var bridgeIp = adapter.config.bridge_ip;
var bridgePort = adapter.config.bridge_port;
var bridgeToken = adapter.config.token;
let bridgeName = (adapter.config.bridge_name === "") ? bridgeIp.replace(/\./g, '_') : adapter.config.bridge_name.replace(/\./g, '_');
var lockListUrl = 'http://' + bridgeIp + ':' + bridgePort + '/list?token='+ bridgeToken;
 
// REST server
var webServer  = null;
var app        = null;
var router     = null;
var timer      = null;

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        if (webServer) {
            webServer.close();
            webServer = null;
        }
        if (timer) clearInterval(timer);
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {

    if (bridgeIp != '') {   
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // adapter.config:
        adapter.log.info('config Nuki bridge name: '   + bridgeName);
        adapter.log.info('config IP address: '         + bridgeIp);
        adapter.log.info('config port: '               + bridgePort);
        adapter.log.info('config token: '              + bridgeToken);

        /**
         *
         *      For every state in the system there has to be also an object of type state
         *
         *      Here a simple template for a boolean variable named "testVariable"
         *
         *      Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
         *
         */

        // adapter.setObjectNotExists(bridgeName + '.name', {
        //     type: 'state',
        //         common: {
        //             name: 'name',
        //             type: 'string',
        //             role: 'text'
        //         },
        //     native: {}
        // });

        // adapter.setState(bridgeName + '.name', {val: bridgeName, ack: true});

        request(
            {
                url: lockListUrl,
                json: true
            },  
            function (error, response, content) {
                adapter.log.info('Lock list requested: ' + lockListUrl);

                if (!error && response.statusCode == 200) {

                    // if (content && content.hasOwnProperty('nukiId')) {
                    // if (content && content[0].hasOwnProperty('nukiId')) { 
                    if (content) {

                        // initWebServer(adapter.config);

                        for (var nukilock in content) {
                            var obj = content[nukilock];

                            set_states(obj);
                        }
                    } else {
                        adapter.log.warn('Response has no valid content. Check IP address and try again.');
                    }

                } else {
                    adapter.log.error(error);
                }
            }
        )
    }

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */

    // the variable testVariable is set to true as command (ack=false)
    /*adapter.setState('testVariable', true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    adapter.setState('testVariable', {val: true, ack: true});

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });*/

}

function set_states(_nukilock){

    var path = bridgeName + '.' + _nukilock;

    adapter.setObjectNotExists(path.nukiId, {
        type: 'device',
        common: {
            name: _nukilock.name
        },
        native: {}
    });

    adapter.setObjectNotExists(path.nukiId + '.state', {
        type: 'state',
        common: {
            name: 'Status',
            type: 'number',
            role: 'value'
        },
        native: {}
    });
    
    adapter.setState(path.nukiId + '.state', {val: _nukilock.lastKnownState.state, ack: true});
    // adapter.subscribeStates(path.nukiId + '.state');

    adapter.setObjectNotExists(path.nukiId + '.stateName', {
        type: 'state',
        common: {
            name: 'Statustext',
            type: 'string',
            role: 'text'
        },
        native: {}
    });
    
    adapter.setState(path.nukiId + '.stateName', {val: _nukilock.lastKnownState.stateName, ack: true});

    adapter.setObjectNotExists(path.nukiId + '.batteryCritical', {
        type: 'state',
        common: {
            name: 'Batterie schwach',
            type: 'boolean',
            role: 'value'
        },
        native: {}
    });
    
    adapter.setState(path.nukiId + '.batteryCritical', {val: _nukilock.lastKnownState.batteryCritical, ack: true});
    // adapter.subscribeStates(path.nukiId + '.batteryCritical');

    adapter.setObjectNotExists(path.nukiId + '.timestamp', {
        type: 'state',
        common: {
            name: 'Statustext',
            type: 'string',
            role: 'time'
        },
        native: {}
    });
    
    adapter.setState(path.nukiId + '.timestamp', {val: _nukilock.lastKnownState.timestamp, ack: true});
    
}

// function initWebServer(_settings) {
//     app    = express();
//     router = express.Router();

//     // install authentication
//     // app.get('/', function (req, res) {
//     //     if (_settings.auth) {
//     //         var b64auth = (req.headers.authorization || '').split(' ')[1] || '';
//     //         var loginPass = new Buffer(b64auth, 'base64').toString().split(':');
//     //         var login     = loginPass[0];
//     //         var password  = loginPass[1];

//     //         // Check in ioBroker user and password
//     //         adapter.checkPassword(login, password, function (result) {
//     //             if (!result) {
//     //                 adapter.log.error('Wrong user or password: ' + login);
//     //                 res.set('WWW-Authenticate', 'Basic realm="nope"');
//     //                 res.status(401).send('You shall not pass.');
//     //             } else {
//     //                 req.user = login;
//     //             }
//     //         });
//     //     } else {
//     //         req.user = _settings.defaultUser;
//     //     }
//     // });

//     // add route cases
//     addRoutes(router);

//     // REGISTER OUR ROUTES -------------------------------
//     // all of our routes will be prefixed with /api
//     app.use('/api', router);

//     if (_settings.port) {
//         webServer = LE.createServer(app, adapter.config, adapter.config.certificates, adapter.config.leConfig, adapter.log);

//         adapter.getPort(_settings.port, function (port) {
//             if (port != _settings.port && !adapter.config.findNextPort) {
//                 adapter.log.error('port ' + _settings.port + ' already in use');
//                 process.exit(1);
//             }
//             webServer.listen(port, _settings.bind, function() {
//                 adapter.log.info('Server listening on http' + (_settings.secure ? 's' : '') + '://' + _settings.bind + ':' + port);
//             });
//         });
//     } else {
//         adapter.log.error('port missing');
//         process.exit(1);
//     }
// }