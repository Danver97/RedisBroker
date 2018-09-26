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
    for (let i = 1; i < array.length; i += 2)
        obj[array[i - 1]] = array[i];
    try {
        obj.payload = JSON.parse(obj.payload);
    } catch (e) {}
    return obj;
}

module.exports = {
    flattenObject,
    buildObject,
};
