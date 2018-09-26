const Path = require('path');
const Ioredis = require('ioredis');
const childProcess = require('child_process');
const ioredisUtil = require('./lib/ioredisUtil');
const keys = require('./keys');
const Event = require('./event');

let redis;
let sub;

const pickAndPublishPicked = 'local eventId = redis.call("rpoplpush", KEYS[1], KEYS[2]) if eventId then local event = redis.call("hgetall", eventId) if event then redis.call("publish", KEYS[3], eventId) return event end end return 0';

function getChecker(env) {
    return childProcess.fork(Path.resolve(__dirname, './checker.js'), { env });
}

const chekerEnv = { MICROSERVICE_NAME: keys.microserviceName };
const checker = getChecker(chekerEnv);

const globalSelf = {
    name: 'global',
    checker,
    redis,
    sub,
};

async function publishEvent(e) {
    const event = Event.fromObject(e);
    const subscribers = await this.redis.smembers(keys.subscribersList(event.topic));
    const multi = this.redis.multi();
    multi.hmset(event.id, ioredisUtil.flattenObject(event));
    for (let i = 0; i < subscribers.length; i++)
        multi.lpush(keys.subscriberPublishedList(subscribers[i]), event.id);
    multi.publish(event.topic, event.message);
    const result = await multi.exec();
    return result;
}

async function pick(cb) {
    const event = ioredisUtil.buildObject(
        await this.redis.pickPublishAndReturn(keys.publishedList, keys.processingList, keys.processingListPick),
    );
    const callbackPromise = cb(event);
    if (callbackPromise && callbackPromise instanceof Promise)
        await Promise.all([callbackPromise]);
    const multi = this.redis.multi();
    multi.lrem(keys.processingList, 1, event.id);
    multi.publish(keys.processingListPickSuccess, event.id);
    await multi.exec();
}

function mockCheckerFailure(nofail) {
    if (nofail) {
        this.checker.send('nofail');
        return;
    }
    this.checker.send('fail');
}

function toggleCheckerLogs() {
    this.checker.send('logs');
}

async function subscribe(topic) {
    this.redis.sadd(keys.subscribersList(topic), keys.microserviceName);
    if (this.checker)
        this.checker.send(keys.processingListPick);
    this.sub.subscribe(topic);
}

function onNotification(cb) {
    // this.sub.on('message', cb);
    this.sub.on('message', (ch, message) => {
        console.log('call');
        cb(ch, message);
    });
}

function pickOnNotification(cb) {
    const functionPick = function () {
        (pick.bind(this))(event => {
            cb(event);
        });
    };
    (onNotification.bind(this))(functionPick.bind(this));
    return functionPick;
}

function removeListener(listener) {
    this.sub.removeListener('message', listener);
}

class EventBroker {
    constructor(config, notFork) {
        const conf = config || {};
        if (!notFork)
            this.checker = getChecker(chekerEnv);
        this.redis = Ioredis.createClient(conf.redisOptions);
        this.sub = Ioredis.createClient(conf.redisOptions);
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

    onNotification(cb) {
        const func = onNotification.bind(this);
        return func(cb);
    }
    
    pickOnNotification(cb) {
        const func = pickOnNotification.bind(this);
        return func(cb);
    }

    removeListener(listener) {
        const func = removeListener.bind(this);
        return func(listener);
    }

    mockCheckerFailure() {
        const func = mockCheckerFailure.bind(this);
        return func();
    }

    toggleCheckerLogs() {
        const func = toggleCheckerLogs.bind(this);
        return func();
    }
}

function exportEventBrokerObject(config) {
    const conf = config || {};
    if (!conf.redisOptions) {
        globalSelf.redis = new Ioredis();
        globalSelf.sub = new Ioredis();
        redis = globalSelf.redis;
        sub = globalSelf.sub;
    }
    if (!redis) {
        globalSelf.redis = new Ioredis(conf.redisOptions);
        redis = globalSelf.redis;
    }
    if (!sub) {
        globalSelf.sub = new Ioredis(conf.redisOptions);
        sub = globalSelf.sub;
    }
    if (!redis.pickPublishAndReturn) {
        globalSelf.redis.defineCommand('pickPublishAndReturn', {
            numberOfKeys: 3,
            lua: pickAndPublishPicked,
        });
    }
    return {
        brokerClient: redis,
        publishEvent: publishEvent.bind(globalSelf),
        subscribe: subscribe.bind(globalSelf),
        onNotification: onNotification.bind(globalSelf),
        pickOnNotification: pickOnNotification.bind(globalSelf),
        pick: pick.bind(globalSelf),
        EventBroker: conf.NODE_ENV === 'test' ? EventBroker : undefined,
        mockCheckerFailure: conf.NODE_ENV === 'test' ? mockCheckerFailure.bind(globalSelf) : undefined,
        toggleCheckerLogs: conf.NODE_ENV === 'test' ? toggleCheckerLogs.bind(globalSelf) : undefined,
        removeListener: conf.NODE_ENV === 'test' ? removeListener.bind(globalSelf) : undefined,
    };
}

module.exports = exportEventBrokerObject;
