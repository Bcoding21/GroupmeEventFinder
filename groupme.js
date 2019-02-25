const axios = require('axios');
const vision = require('@google-cloud/vision');
const visionClient = new vision.ImageAnnotatorClient();
const BASE_URL = 'https://api.groupme.com/v3';

const statusCodes = {
    'OK': 200
}

const endpoints = {
    'groups': '/groups',
    'messages': '/messages',
    'bots': '/bots/post'
}

module.exports.getGroupChats = async function (params) {
    let groupChats = undefined;
    try {
        const url = `${BASE_URL}${endpoints.groups}`;
        const response = await axios.get(url, { params });
        if (response.status === statusCodes.OK) {
            groupChats = response.data;
        }
    } catch (error) {
        console.log(error.message);
    }
    return groupChats;
}

module.exports.getMessages = async function (params) {
    let messages = undefined;
    let {groupId, ...requestParams} = params;
    const url = `${BASE_URL}${endpoints.groups}/${groupId}${endpoints.messages}`;
    try {
        const response = await axios.get(url, { 'params' : requestParams });
        if (response.status === statusCodes.OK) {
            messages = response.data.response.messages;
        }
    } catch (error) {
        console.log(error.message);
    }
    return messages;
}

module.exports.postMessage = async function (params) {
    const { token, ...botData } = params;
    const requestParams = { 'token': token };
    const url = `${BASE_URL}${endpoints.bots}`;
    let didSend = false;
    try {
        const response = await axios.post(url, botData, { 'params' : requestParams });
        didSend = response.status === statusCodes.OK;
    } catch (error) {
        console.log(error);
    }
    return didSend;
}