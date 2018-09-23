const redis = require('ioredis').createClient();
const sub = require('ioredis').createClient();
const keys = require('./keys');

/*
STRATEGIA:
- sottoscrizione a canale di notifica.
- ad ogni notifica:
    - si pusha l'id della notifica in un sorted set con score pari al Date.now() (o qualcosa di equivalente, ma più preciso)
    - si legge il valore del primo elemento nella processing list.
    - se il valore dello score del primo elemento nella processing list è uguale a score + 3sec > Date.now()
        - elimino valore da processing list e pusho della publishedList in testa (e notifico ?). // atomico
        - elimino valore da sorted set se score + 3sec > Date.now() // atomico

*/

let failInTestEnv = false;
const renqueueIfPresent = "local count = redis.call('lrem', KEYS[1], 1, KEYS[4]) if count == 1 then redis.call('rpush', KEYS[2], KEYS[4]) redis.call('zrem', KEYS[3], KEYS[4]) redis.call('publish', KEYS[2], KEYS[4]) return 1 end return 0";

redis.defineCommand('renqueueIfPresent', {
    numberOfKeys: 4,
    lua: renqueueIfPresent,
});

async function strategy1(ch, message) {
    console.log('\tchecker!');
    await redis.zadd(keys.processingListSS, Date.now(), message);
    const id = (await redis.lrange(keys.processingList, -1, 0))[0];
    if (!id)
        return;
    let score = await redis.zscore(keys.processingListSS, id);
    score = parseInt(score);
    if (score + 100 < Date.now()) {
        const multi = redis.multi();
        multi.lrem(keys.processingList, 1, id);
        multi.rpush(keys.publishedList, id);
        multi.zrem(keys.processingListSS, id);
        multi.publish(keys.processingListSS, id);
        await multi.exec();
    }
}

async function strategy2(ch, message) {
  // console.log('\tchecker!');
  await redis.zadd(keys.processingListSS, Date.now(), message);
  setTimeout(async () => {
      try {
          if (failInTestEnv)
              throw new Error('Mocked failure!');
          const result = await redis.renqueueIfPresent(keys.processingList, keys.publishedList, keys.processingListSS, message);
          console.log('\texecuted ' + result + ' pid: ' + process.pid);
      } catch (e) {
         console.log('\tchecker pid: ' + process.pid + ' Mocked failure');
      }
  }, 100);
}

sub.on('message', strategy2);

process.on('message', async (topic) => {
    // console.log('\tchecker subscribe! pid: ' + process.pid);
    // console.log('\tchecker ' + topic);
    if (topic === 'fail') {
        failInTestEnv = true;
    }
    else 
        await sub.subscribe(topic);
});
