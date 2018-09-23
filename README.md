# RedisBroker
A simple redis event broker implementation.

This event broker is thought to be used in an event sourcing evironment. It should be used as a module inside a microservice application.
This means that to be effective and fault tolerant needs multiple instaces of the microservice application that it's using it.

### Advantages
- No need to deploy and manage another dedicated service which works as an event broker manager.
- Fault tolerance stricly related to the fault tolerance of the microservice which is using it.

### Drawbacks
- Not recommend for really large instaces number and very-intensive event communication 
because it can lead to too many (unnecessary) calls to redis that i'm not sure if redis can manage.
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

## Todo
- Explain how it works
- More detailed informations on APIs.
- Publish everything on npm.
