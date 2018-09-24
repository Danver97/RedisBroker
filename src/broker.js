const Path = require('path');
const ioredis = require('ioredis');
const redis = require('ioredis').createClient();
const sub = require('ioredis').createClient();
const childProcess = require('child_process');
const keys = require('./keys');
const ioredisUtil = require('./lib/ioredisUtil');

const pickAndPublishPicked = 'local eventId = redis.call("rpoplpush", KEYS[1], KEYS[2]) if eventId then local event = redis.call("hgetall", eventId) if event then redis.call("publish", KEYS[3], eventId) return event end end return 0';

redis.defineCommand('pickPublishAndReturn', {
    numberOfKeys: 3,
    lua: pickAndPublishPicked,
});

function getChecker(env) {
    return childProcess.fork(Path.resolve(__dirname, './checker.js'), { env });
}

const chekerEnv = { MICROSERVICE_NAME: keys.microserviceName };
const checker = getChecker(chekerEnv);

const globalSelf = {
    checker,
    redis,
    sub,
};

async function publishEvent(event) {
    const subscribers = await this.redis.smembers(keys.subscribersList(event.topic));
    const multi = this.redis.multi();
    multi.hmset(event.id, ioredisUtil.flattenObject(event));
    for (let i = 0; i < subscribers.length; i++)
        multi.lpush(keys.subscriberPublishedList(subscribers[i]), event.id);
    multi.publish(event.topic, event.topic);
    const result = await multi.exec();
    return result;
}

async function pick(cb) {
    const event = ioredisUtil.buildObject(
        await this.redis.pickPublishAndReturn(keys.publishedList, keys.processingList, keys.processingListTopicNotif),
    );
    cb(event);
    await this.redis.lrem(keys.processingList, 1, event.id);
}

function mockCheckerFailure() {
    this.checker.send('fail');
}

async function subscribe(topic) {
    this.redis.sadd(keys.subscribersList(topic), keys.microserviceName);
    if (this.checker)
        this.checker.send(keys.processingListTopicNotif);
    // checker.send(topic);
    this.sub.subscribe(topic);
}

function on(topic, cb) {
    this.sub.on(topic, cb);
}

class EventBroker {
    constructor(notFork) {
        if (!notFork)
            this.checker = getChecker(chekerEnv);
        this.redis = ioredis.createClient();
        this.sub = ioredis.createClient();
        this.redis.defineCommand('pickPublishAndReturn', {
            numberOfKeys: 3,
            lua: pickAndPublishPicked,
        });
    }

    async publishEvent(event) {
        const func = publishEvent.bind(this);
        return func(event);
    }

    async pick(cb) {
        const func = pick.bind(this);
        return func(cb);
    }

    async subscribe(topic) {
        const func = subscribe.bind(this);
        return func(topic);
    }

    on(pubSubEvent, cb) {
        const func = on.bind(this);
        return func(pubSubEvent, cb);
    }

    mockCheckerFailure() {
        const func = mockCheckerFailure.bind(this);
        return func();
    }
}

function exportEventBrokerObject(config) {
    const conf = config || {};
    return {
        brokerClient: redis,
        publishEvent: publishEvent.bind(globalSelf),
        subscribe: subscribe.bind(globalSelf),
        on: on.bind(globalSelf),
        pick: pick.bind(globalSelf),
        EventBroker: conf.NODE_ENV === 'test' ? EventBroker : undefined,
        mockCheckerFailure: conf.NODE_ENV === 'test' ? mockCheckerFailure.bind(globalSelf) : undefined,
    };
}

module.exports = exportEventBrokerObject;