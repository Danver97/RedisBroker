const uuidv4 = require('uuid/v4');

class Event {
    constructor(streamId, topic, message, payload) {
        if (!streamId || !topic)
            throw new Error(`Event - Error, missing: ${streamId ? '' : 'streamId'} ${topic ? '' : 'topic'}`);
        this.id = uuidv4();
        this.streamId = streamId;
        this.topic = topic;
        this.message = message;
        this.payload = payload;
        if (typeof this.payload === 'object')
            this.payload = JSON.stringify(this.payload);
    }
    
    static fromObject(eventObj) {
        const event = new Event(eventObj.streamId, eventObj.topic, eventObj.message, eventObj.payload);
        Object.keys(eventObj).forEach(k => {
            if (k !== 'streamId' && k !== 'topic' && k !== 'message' && k !== 'payload')
                event[k] = eventObj[k];
        });
        if (!event.id)
            event.id = uuidv4();
        return event;
    }
}

module.exports = Event;
