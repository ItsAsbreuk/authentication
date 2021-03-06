// Fork from `hapi-auth-cookie`
// Extended with the config-property `loginView`, which should be a view
// with a login-form which stes the cookie after succesful login


// Load modules

"use strict";

var Boom = require('boom');
var Hoek = require('hoek');


// Declare internals

var internals = {};


exports.register = function (server, options, next) {

    server.auth.scheme('itsa-auth', internals.implementation);
    next();
};


exports.register.attributes = {
    pkg: require('./package.json')
};


internals.implementation = function (server, options) {

    Hoek.assert(options, 'Missing cookie auth strategy options');
    Hoek.assert(typeof options.validateCookie === 'function', 'Invalid validateCookie method in configuration');
    Hoek.assert(options.keyGen, 'Missing required keyGen in configuration');
    Hoek.assert(options.loginView, 'Missing required loginView in configuration');
    Hoek.assert(!options.keepAlive || options.ttl, 'Cannot configure keepAlive without ttl');

    var settings = Hoek.clone(options); // Options can be reused
    settings.cookie = settings.cookie || 'sid';

    var cookieOptions = {
        encoding: 'iron',
        password: settings.keyGen,
        isSecure: settings.isSecure !== false,                  // Defaults to true
        path: '/',
        isHttpOnly: settings.isHttpOnly !== false,              // Defaults to true
        clearInvalid: settings.clearInvalid,
        ignoreErrors: true
    };

    if (settings.ttl) {
        cookieOptions.ttl = settings.ttl;
    }

    if (settings.domain) {
        cookieOptions.domain = settings.domain;
    }

    if (settings.path) {
        cookieOptions.path = settings.path;
    }

    if (typeof settings.appendNext === 'boolean') {
        settings.appendNext = (settings.appendNext ? 'next' : '');
    }

    server.state(settings.cookie, cookieOptions);

    server.ext('onPreAuth', function (request, reply) {
        request.auth.retries = settings.retries;
        request.auth.session = {
            set: function (session, value) {

                if (arguments.length > 1) {
                    var key = session;
                    Hoek.assert(key && typeof key === 'string', 'Invalid session key');
                    session = request.auth.artifacts;
                    Hoek.assert(session, 'No active session to apply key to');

                    session[key] = value;
                    return reply.state(settings.cookie, session);
                }

                Hoek.assert(session && typeof session === 'object', 'Invalid session');
                request.auth.artifacts = session;
                reply.state(settings.cookie, session);
            },
            clear: function (key) {

                if (arguments.length) {
                    Hoek.assert(key && typeof key === 'string', 'Invalid session key');
                    var session = request.auth.artifacts;
                    Hoek.assert(session, 'No active session to clear key from');
                    delete session[key];
                    return reply.state(settings.cookie, session);
                }

                request.auth.artifacts = null;
                reply.unstate(settings.cookie);
            },
            ttl: function (msecs) {

                var session = request.auth.artifacts;
                Hoek.assert(session, 'No active session to modify ttl on');
                reply.state(settings.cookie, session, { ttl: msecs });
            }
        };

        return reply.continue();
    });

    var scheme = {
        authenticate: function (request, reply) {

            var validate = function () {
                // Check cookie
                var session = request.state[settings.cookie];
                if (!session) {
                    reply.reactview(settings.loginView);
                }
                else {
                    settings.validateCookie.call(request, session, function (err, isValid, credentials) {
                        if (err || !isValid) {
                            if (settings.clearInvalid) {
                                reply.unstate(settings.cookie);
                            }
                            reply.reactview(settings.loginView);
                            return;
                        }

                        // keepAlive:
                        reply.state(settings.cookie, session);

                        return reply.continue({ credentials: credentials || session, artifacts: session });
                    });
                }
            };

            validate();
        }
    };

    return scheme;
};
