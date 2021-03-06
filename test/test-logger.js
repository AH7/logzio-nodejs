var sinon  = require('sinon');
var logzioLogger = require('../lib/logzio-nodejs.js');
var request = require('request');
var nock = require('nock');
var assert = require('assert');

var dummyHost = "logz.io";
var nockHttpAddress = "http://"+dummyHost+":8070";

var createLogger = function(options) {
    var myoptions = options;
    myoptions.token = 'acrSGIefherhsZYOpzxeGBpTyqgSzaMk';
    myoptions.type = 'testnode';
    myoptions.debug = true;
    myoptions.host = dummyHost;
    return logzioLogger.createLogger(myoptions);
};


describe('logger', function() {
    this.timeout(25000);

    describe('#log-single-line', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('sends log as a string', function (done) {
            var logger = createLogger({bufferSize:1, callback: done});
            sinon.spy(logger, '_createBulk');

            var logMsg = "hello there from test";
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg);

            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as a string with extra fields', function(done) {
            var logger = createLogger({
                bufferSize:1,
                callback: done,
                extraFields:{
                    extraField1: 'val1',
                    extraField2: 'val2'
                }
            });
            sinon.spy(logger, '_createBulk');

            var logMsg = "hello there from test";
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as an object', function (done) {
            var logger = createLogger({bufferSize:1, callback: done});
            sinon.spy(logger, '_createBulk');

            var logMsg = {message: "hello there from test"};
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].message == logMsg.message);

            logger._createBulk.restore();
            logger.close();
        });

        it('sends log as an object with extra fields', function(done) {
            var logger = createLogger({
                bufferSize:1,
                callback: done,
                extraFields:{
                    extraField1: 'val1',
                    extraField2: 'val2'
                }
            });
            sinon.spy(logger, '_createBulk');

            var logMsg = {message: "hello there from test"};
            logger.log(logMsg);
            assert(logger._createBulk.getCall(0).args[0][0].extraField1 == 'val1');
            assert(logger._createBulk.getCall(0).args[0][0].extraField2 == 'val2');

            logger._createBulk.restore();
            logger.close();
        });
    });

    describe('#log-multiple-lines', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('Send multiple lines', function (done) {
            var logger = createLogger({bufferSize:3, callback: done});
            logger.log({messge:"hello there from test", testid:2});
            logger.log({messge:"hello there from test2", testid:2});
            logger.log({messge:"hello there from test3", testid:2});
            logger.close();
        });

        it('Send multiple bulks', function (done) {
            var timesCalled = 0;
            var expectedTimes = 2;
            function shouldBeCalledTimes() {
                timesCalled++;
                if (expectedTimes == timesCalled) done();
            }
            var logger = createLogger({bufferSize:3, callback: shouldBeCalledTimes});
            logger.log({messge:"hello there from test", testid:3});
            logger.log({messge:"hello there from test2", testid:3});
            logger.log({messge:"hello there from test3", testid:3});

            logger.log({messge:"hello there from test", testid:4});
            logger.log({messge:"hello there from test2", testid:4});
            logger.log({messge:"hello there from test3", testid:4});
            logger.close();
        });
    });

    describe('#log-closing', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('Don\'t allow logs after closing', function (done) {
            var logger = createLogger({bufferSize:1});
            logger.close();
            try {
              logger.log({messge:"hello there from test"});
              done("Expected an error when logging into a closed log!");
            } catch (ex) {
              done();
            }
        });
    });

    describe('#timers', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 200} , "");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('timer-send-test', function (done) {
            var timesCalled = 0;
            var expectedTimes = 2;
            function shouldBeCalledTimes() {
                timesCalled++;
                if (expectedTimes == timesCalled) done()
            }
            var logger = createLogger({bufferSize:100, sendIntervalMs:10000, callback: shouldBeCalledTimes});

            // These messages should be sent in 1 bulk 10 seconds from now (due to sendIntervalMs)
            logger.log({messge:"hello there from test", testid:5});
            logger.log({messge:"hello there from test2", testid:5});
            logger.log({messge:"hello there from test3", testid:5});

            // Schedule 100 msgs (buffer size) which should be sent in one bulk 11 seconds from start
            setTimeout(function(){
                for (var i = 0; i < 100; i++) {
                    logger.log({messge:"hello there from test", testid:6});
                }
                logger.close();
            }, 11000)

        });

    });

    describe('#recover-after-server-fails-one-time', function () {
        var errorAndThenSuccessScope;
        var extraRequestScope;
        before(function(done){
            nock.cleanAll();
            errorAndThenSuccessScope = nock(nockHttpAddress)
                .post('/')
                .socketDelay(5000)
                .query(true)
                .once()
                .reply(200, '')

                // success
                .post('/')
                .socketDelay(0)
                .query(true)
                .once()
                .reply(200, '');

            extraRequestScope = nock(nockHttpAddress)
                .filteringPath(function(path) {
                    return '/';
                })
                .post('/')
                .once()
                .reply(200, '')

            done();
        });

        after(function(done){
            nock.restore();
            nock.cleanAll();
            done();
        });

        it('Msgs are only sent once', function (done) {

            // very small timeout so the first request will fail (nock setup this way above) and
            // then second attempt will succeed
            var logger = createLogger({bufferSize:1, sendIntervalMs:50000, timeout: 1000});

            logger.log({messge:"hello there from test", testid:5});
            logger.close();

            setTimeout(function(){
                if (!errorAndThenSuccessScope.isDone()) {
                    done(new Error('pending mocks: ' + errorAndThenSuccessScope.pendingMocks()));
                } else {
                    if (extraRequestScope.isDone()) {
                        done(new Error("We don't expect another request"))
                    } else {
                        done();
                    }
                }
            }, 10000)
        });

    });

    describe('#bad-request', function () {
        before(function(done){
            sinon
                .stub(request, 'post')
                .yields(null, {statusCode: 400} , "bad");
            done();
        });

        after(function(done){
            request.post.restore();
            done();
        });

        it('bad request test', function (done) {
            var logger = createLogger({bufferSize:3, callback: function(err) {
                if (err) {
                    done();
                } else {
                    done("Expected an error");
                }
            }});
            logger.log({messge:"hello there from test", testid:2});
            logger.log({messge:"hello there from test2", testid:2});
            logger.log({messge:"hello there from test3", testid:2});
            logger.close();
        });
    });

});
