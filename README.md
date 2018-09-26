# RedisEventBroker
A simple redis event broker implementation.

This event broker is thought to be used in an event sourcing evironment. It should be used as a module inside a microservice application.
This means that to be effective and fault tolerant needs multiple instaces of the microservice application that it's using it.

### Advantages
- No need to deploy and manage another dedicated service which works as an event broker manager.
- Fault tolerance stricly related to the fault tolerance of the microservice which is using it.

### Drawbacks
- Not recommend for really large instaces number and very-intensive event communication 
because it can lead to too many (unnecessary) calls to redis that I'm not sure if redis can manage them.
This is a very small experimental but perfectly working project. 
It's really easy to integrate and use it but a good scalability it's not assured.

## How it works
Each subscriber to a certain topic subscribes using RedisEvents to that topic.

When `redisEventBroker.publishEvent(event)` is called RedisEventBroker fetch every subscriber of that event's topic and push atomically the serialized event to every subscriber's *publishedList* and publish a redis event with the topic name as a message.

Each subscriber, receiveing a new redis event, calls `redisEventBroker.pick(cb)` processing the event in the callback function.

The "event picking" is done atomically and consists of:
- Removing the first event from the *publishedList* and pushing it in the *processingList*
- Publish a new *processingNotification* redis event.

After processing the event, the event is deleted from the *processingList*.

In case of processing failure or microservice's instace failure the event will be reinserted in the *publishedList* and another instance will process it.

This is achieved because on the *processingNotification* event, each instance of the microservice register a new timeout of 100ms (for now it's an arbitrary value, it will be customizable). After that if the processing event is still in the *processingList* will be atomically removed and reinserted at the front of the *publishedList*. During the removing and reinsertion a new *eventPublished* redis event is raised atomically so that other microservice instances are notified.

## Installation
Run: `npm install redis-event-broker --save`

## How to use it

**Important note:** in order to publish and pick the events in the right lists it's required that `process.env.MICROSERVICE_NAME` environment variable is initialized. Otherwise this module will throw an error.

### Require
```js
const redisEventBroker = require('redis-event-broker')();
```
The module create a new forked process (called *checker process*) responsible to check that lost events in *processing* state are re-enqued in the *publishedList*.

**Note:** every time the function `RedisEventBroker` is called no new instances of redis client are created and no new *checker processes* are created.

### Event publishing
To publish an event:
```js
redisEventBroker.publishEvent(event);
```
The `event` object must have the following fields:
- `streamId`
- `topic`
Other optional fields:
- `message`
- `payload`

### Event picking
To pick an event:
```js
redisEventBroker.pick(cb);
```

**Note:** every asyncronous job in the callback must be awaited or returned in a promise. Otherwise on unsuccessful event processing the event will be handled as successful.

### Topic subscription
To subscribe to a new topic:
```js
redisEventBroker.subscribe(topic);
```

### Topic's "new event" event handling
To react to a new event notification:
```js
redisEventBroker.onNotification(cb);
```

You can combine `redisEventBroker.onNotification` with `redisEventBroker.pick`, to pick new messages on notification (let's call it *picking on notification* from now on).

#### Example
```js
redisEventBroker.onNotification(() => {
    redisEventBroker.pick((event) => {
        if (event.topic === first_topic) {
            // Do stuff...
        } else if (event.topic === second_topic) {
            // Do other stuff...
        }
    });
});
```

Currently is not possible to register callbacks based on events topics and messages. If you don't like to have a big if-else tree you can:

```js
const emitter = new (require('events'))();

redisEventBroker.onNotification(() => {
    redisEventBroker.pick((event) => {
        emitter.emit(`${event.topic}:${event.message}`, event);
    });
});

emitter.on('topic1:entityCreated', (event) => {});
emitter.on('topic2:entityCreated', (event) => {});

// Don't to this:
emitter.on('topic3:entityCreated', (event) => {
    setImmediate(() => {
        // Do stuff...
    });
});
```
Since EventEmitter callbacks are called syncronously everything is ok for the pick callback.

### *Picking on notification*
From `1.3.x` you can get new event on notification like this:
```js
redisEventBroker.pickOnNotification(event => {
    // Do stuff...
})
```

#### Example
```js
const emitter = new (require('events'))();

redisEventBroker.pickOnNotification(event => {
    emitter.emit(`${event.topic}:${event.message}`, event);
});

emitter.on('topic1:entityCreated', (event) => {});
emitter.on('topic2:entityCreated', (event) => {});
```

## Todo
- Nothing to do (for now).
