const microserviceName = process.env.MICROSERVICE_NAME || 'abc';

module.exports = {
    subscriberPublishedList: (sub) => `${sub}:publishedList`,
    publishedList: `${microserviceName}:publishedList`,
    processingList: `${microserviceName}:processingList`,
    processingListSS: `${microserviceName}:processingListSortedSet`,
    subscribersList: (topic) => `subscribers:${topic}`,
    processingListTopicNotif: `${microserviceName}:processingList:pick`,
};
