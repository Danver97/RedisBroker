const assert = require('assert');
const sub = require('ioredis').createClient();
const redis = require('ioredis').createClient();
const config = { NODE_ENV: 'test' };
const redisEventBroker = require('../index')(config);
const redisEventBroker2 = new ((require('../index'))(config).EventBroker)();
const keys = require('../keys');

function wait(ms) {
    var start = Date.now(),
        now = start;
    while (now - start < ms) {
      now = Date.now();
    }
}


describe('Redis eventBroker unit test', function () {
    const eventProva = {
        id: '11111',
        topic: 'provaEvent',
        payload: 'thispayload',
    };
    const eventProva2 = {
        id: '11112',
        topic: 'provaEvent',
        payload: 'thispayload',
    };
    const subscriber = 'firstSubscriber';
    const microserviceName = 'abc';
    const subscribers = [ subscriber, microserviceName ];
    
    context('Single instance', function() {
        sub.subscribe(eventProva.topic, (err, count) => {
            // console.log('subscribed');
        });
        
        it('check if event added', async function() {
            // Reset db and inizialize subscribers
            await redisEventBroker.subscribe(eventProva.topic);
            await redis.flushall();
            const pipeline = redis.pipeline();
            subscribers.forEach(s => pipeline.lpush(keys.subscribersList(eventProva.topic), s));
            await pipeline.exec();
            
            // Publish event
            const result = await redisEventBroker.publishEvent(eventProva);
            
            // Start asserting
            for (let i = 1; i < subscribers.length + 1; i++) {
                assert.strictEqual(result[i][1], 1);
            }
            const published = await redis.lrange(keys.subscriberPublishedList(subscriber), -1, -1);
            const event = await redis.hgetall(published);
            assert.strictEqual(published[0], eventProva.id);
            assert.deepStrictEqual(event, eventProva);
        });
        
        it('check if event picked', async function() {
            const result = await redisEventBroker.pick((event) => {
                assert.deepStrictEqual(event, eventProva);
            });
        });
        
        it('check if event is renqued on failure', async function() {
            wait(1400);
            await redisEventBroker.publishEvent(eventProva);
            try {
                // Fails and leave an unprocessed message in the processingList.
                await redisEventBroker.pick((event) => {
                    throw new Error('Mocked failure!');
                });
            } catch (e) {
                wait(150);
                const eventId = await redis.lrange(keys.publishedList, -1, -1);
//                console.log('eventId');
//                console.log(eventId);
//                console.log('assert start');
                assert.strictEqual(eventId[0], eventProva.id); // Check that the lost message has been saved.
                const remainingEvents = await redis.lrange(keys.processingList, 0, -1);
                assert.strictEqual(JSON.stringify(remainingEvents), '[]');
            }
        });
    });
    
    context('Multi instance', function() {
        sub.subscribe(eventProva.topic, (err, count) => {
            // console.log('subscribed');
        });
        
        it('check if event is renqued on failure', async function() {
            const prom1 = redisEventBroker.subscribe(eventProva.topic);
            const prom2 = redisEventBroker2.subscribe(eventProva.topic);
            await Promise.all([prom1, prom2]);
            await redis.flushall();
            const pipeline = redis.pipeline();
            subscribers.forEach(s => pipeline.lpush(keys.subscribersList(eventProva.topic), s));
            await pipeline.exec();
            await redisEventBroker.publishEvent(eventProva);
            await redisEventBroker2.publishEvent(eventProva2);
            redisEventBroker.mockCheckerFailure();
            wait(50);
            try {
                // Fails and leave an unprocessed message in the processingList.
                await redisEventBroker2.pick((event) => {
                    throw new Error('Mocked failure!');
                });
            } catch (e) {
                wait(150);
                const eventId = await redis.lrange(keys.publishedList, -1, -1);
                assert.strictEqual(eventId[0], eventProva.id); // Check that the lost message has been saved.
                assert.strictEqual(await redis.llen(keys.publishedList), 2); // Check that the lost message has been saved.
                const remainingEvents = await redis.lrange(keys.processingList, 0, -1);
                assert.strictEqual(JSON.stringify(remainingEvents), '[]');
            }
        })
    });
});