const redis = require('ioredis').createClient();
const sub = require('ioredis').createClient();
const keys = require('./keys');

let failInTestEnv = false;
let logs = false;
const renqueueIfPresent = 'local count = redis.call("lrem", KEYS[1], 1, KEYS[4]) if count == 1 then redis.call("rpush", KEYS[2], KEYS[4]) redis.call("zrem", KEYS[3], KEYS[4]) redis.call("publish", KEYS[2], KEYS[4]) return 1 end return 0';

redis.defineCommand('renqueueIfPresent', {
    numberOfKeys: 4,
    lua: renqueueIfPresent,
});

const timeouts = {};

/*
async function strategy1(ch, message) {
    console.log('\tchecker!');
    await redis.zadd(keys.processingListSS, Date.now(), message);
    const id = (await redis.lrange(keys.processingList, -1, 0))[0];
    if (!id)
        return;
    let score = await redis.zscore(keys.processingListSS, id);
    score = parseInt(score, 10);
    if (score + 100 < Date.now()) {
        const multi = redis.multi();
        multi.lrem(keys.processingList, 1, id);
        multi.rpush(keys.publishedList, id);
        multi.zrem(keys.processingListSS, id);
        multi.publish(keys.processingListSS, id);
        await multi.exec();
    }
}
*/

async function strategy2(ch, message) {
    // if (logs) console.log('\tchecker!');
    if (ch === keys.processingListPick) {
        await redis.zadd(keys.processingListSS, Date.now(), message);
        timeouts[message] = setTimeout(async () => {
            try {
                if (failInTestEnv)
                    throw new Error('Mocked failure!');
                const result = await redis.renqueueIfPresent(keys.processingList, keys.publishedList, keys.processingListSS, message);
                if (logs) console.log(`\texecuted ${result} pid: ${process.pid}`);
            } catch (e) {
                if (logs) console.log(`\tchecker pid: ${process.pid} Mocked failure`);
            }
        }, 100);
    } else if (ch === keys.processingListPickSuccess)
        clearTimeout(timeouts[message]);
}

sub.on('message', strategy2);

process.on('message', async topic => {
    if (topic === 'fail')
        failInTestEnv = true;
    else if (topic === 'nofail')
        failInTestEnv = false;
    else if (topic === 'logs') {
        logs = !logs;
        // console.log(process.pid + ' logs: ' + logs);
    } else 
        await sub.subscribe(topic);
});
