const Path = require('path');
const ioredis = require('ioredis');
const redis = require('ioredis').createClient();
const sub = require('ioredis').createClient();
const childProcess = require('child_process');
const keys = require('./keys');

const checker = childProcess.fork(Path.resolve(__dirname, './checker.js'));

// const pickAndPublishPicked = 'local eventId = redis.call("rpoplpush", KEYS[1], KEYS[2]) if eventId then redis.call("publish", KEYS[3], eventId) return eventId end return 0';
const pickAndPublishPicked = 'local eventId = redis.call("rpoplpush", KEYS[1], KEYS[2]) if eventId then local event = redis.call("hgetall", eventId) if event then redis.call("publish", KEYS[3], eventId) return event end end return 0';

redis.defineCommand('pickPublishAndReturn', {
    numberOfKeys: 3,
    lua: pickAndPublishPicked,
});

function flattenObject(obj) {
    const result = [];
    Object.keys(obj).forEach(k => {
        result.push(k);
        result.push(obj[k]);
    });
    return result;
}

function buildObject(array) {
    if (array.length % 2 !== 0)
        return null;
    const obj = {};
    for (let i = 1; i < array.length; i += 2) {
        obj[array[i - 1]] = array[i];
    }
    return obj;
}

class EventBroker {
    constructor(notFork) {
        if (!notFork)
            this.checker = childProcess.fork(Path.resolve(__dirname, './checker.js'));
        this.redis = ioredis.createClient();
        this.sub = ioredis.createClient();
    }
    
    async publishEvent(event) {
        const subscribers = await redis.lrange(keys.subscribersList(event.topic), 0, 10000000000);
        const multi = this.redis.multi();
        multi.hmset(event.id, flattenObject(event));
        for (let i = 0; i < subscribers.length; i++) {
            multi.lpush(keys.subscriberPublishedList(subscribers[i]), event.id);
        }
        multi.publish(event.topic, event.id);
        const result = await multi.exec();
        return result;
    }
    
    async pick(cb) {
        const eventId = await redis.rpoplpush(keys.publishedList, keys.processingList);
        const multi = this.redis.multi();
        multi.hgetall(eventId);
        multi.publish(keys.processingListTopicNotif, eventId);
        // console.log('result');
        const result = await multi.exec();
        const event = result[0][1];
        cb(event);
        await this.redis.lrem(keys.processingList, 1, eventId);
    }
    
    async subscribe(topic) {
        if (this.checker)
            this.checker.send(keys.processingListTopicNotif);
        this.sub.subscribe(topic);
    }

    on(pubSubEvent, cb) {
        this.sub.on(pubSubEvent, cb);
    }
    
    mockCheckerFailure() {
        this.checker.send('fail');
    }

}

async function publishEvent(event) {
    const subscribers = await redis.lrange(keys.subscribersList(event.topic), 0, 10000000000);
    const multi = redis.multi();
    multi.hmset(event.id, flattenObject(event));
    for (let i = 0; i < subscribers.length; i++) {
        multi.lpush(keys.subscriberPublishedList(subscribers[i]), event.id);
    }
    multi.publish(event.topic, event.topic);
    const result = await multi.exec();
    return result;
}

async function pick1(cb) {
    const eventId = await redis.rpoplpush(keys.publishedList, keys.processingList);
    const event = await redis.hgetall(eventId);
    cb(event);
    await redis.lrem(keys.processingList, 1, eventId);
}

async function pick2(cb) {
    const event = buildObject(await redis.pickPublishAndReturn(keys.publishedList, keys.processingList, keys.processingListTopicNotif));
    // console.log(event);
    cb(event);
    await redis.lrem(keys.processingList, 1, event.id);
}

const pick = pick2;

function mockCheckerFailure() {
    checker.send('fail');
}

async function subscribe(topic) {
    checker.send(keys.processingListTopicNotif);
//    checker.send(topic);
    sub.subscribe(topic);
}

function on(pubSubEvent, cb) {
    sub.on(pubSubEvent, cb);
}

function exportEventBrokerObject(config) {
    const conf = config || {};
    return {
        EventBroker: conf.NODE_ENV === 'test' ? EventBroker : undefined,
        brokerClient: redis,
        publishEvent,
        subscribe,
        mockCheckerFailure: conf.NODE_ENV === 'test' ? mockCheckerFailure : undefined,
        on,
        pick,
    }
}

module.exports = exportEventBrokerObject;
