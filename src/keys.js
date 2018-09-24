const microserviceName = process.env.MICROSERVICE_NAME;

if (!microserviceName)
    throw new Error('Required environment variable \'MICROSERVICE_NAME\' to be set.');

module.exports = {
    microserviceName,
    subscriberPublishedList: sub => `${sub}:publishedList`,
    publishedList: `${microserviceName}:publishedList`,
    processingList: `${microserviceName}:processingList`,
    processingListSS: `${microserviceName}:processingListSortedSet`,
    subscribersList: topic => `subscribers:${topic}`,
    processingListTopicNotif: `${microserviceName}:processingList:pick`,
    processingListTopicNotifSuccess: `${microserviceName}:processingList:pick:success`,
};
