# RedisBroker
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

## Installation
This module is currently not on npm. 
To install it copy this repository it to your folder and check that your project is using npm's 'ioredis' module
(if not just `npm install ioredis --save`).

## How to use it
Usage:
```js
const RedisBroker = require(/* path to RedisBroker folder */);
const broker = RedisBroker();
```

To publish an event:
```js
broker.publishEvent(event);
```

To pick an event:
```js
broker.pick(cb);
```

To subscribe to a new topic:
```js
broker.subscribe(topic);
```

To react to a new event of `topic`:
```js
broker.on(topic, cb);
```

## How it works
Each subscriber to a certain topic subscribes using RedisEvents to that topic.

When `broker.publishEvent(event)` is called RedisBroker fetch every subscriber of that event's topic and push atomically the serialized event to every subscriber's *publishedList* and publish a redis event with the topic name as a message.

Each subscriber, receiveing a new redis event, calls `broker.pick(cb)` processing the event in the callback function.

The "event picking" is done atomically and consists of:
- Removing the first event from the *publishedList* and pushing it in the *processingList*
- Publish a new *processingNotification* redis event.

After processing the event, the event is deleted from the *processingList*.

In case of processing failure or microservice's instace failure the event will be reinserted in the *publishedList* and another instace will process it.

This is achieved because on the *processingNotification* event, each instance of the microservice register a new timeout of 100ms (for now it's an arbitrary value, it will be customizable). After that if the processing event is still in the *processingList* will be atomically removed and reinserted at the front of the *publishedList*. During the remove and reinsert a new *eventPublished* redis event is raised atomically so that other microservice instances are notified.

## Todo
- More detailed informations on APIs.
- Publish everything on npm.
