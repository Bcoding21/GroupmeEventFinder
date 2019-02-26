import axios from 'axios';
//const vision = require('@google-cloud/vision');
//const visionClient = new vision.ImageAnnotatorClient();
const BASE_URL = 'https://api.groupme.com/v3';

const statusCodes = {
    'OK': 200
}

const endpoints = {
    'groups': '/groups',
    'messages': '/messages',
    'bots': '/bots/post'
}

async function getGroupChats(params) {
    const url = `${BASE_URL}${endpoints.groups}`;
    const response = await axios.get(url, { params });
    return response.status === statusCodes.OK ? response.data : null;
}

async function getMessages(params) {
    let { groupId, ...requestParams } = params;
    const url = `${BASE_URL}${endpoints.groups}/${groupId}${endpoints.messages}`;
    const response = await axios.get(url, { 'params': requestParams });
    return response.status == statusCodes.OK ? response.data.response.messages : null;
}

async function postMessage(params) {
    const { token, ...botData } = params;
    const requestParams = { 'token': token };
    const url = `${BASE_URL}${endpoints.bots}`;
    const response = await axios.post(url, botData, { 'params': requestParams });
    return response.status === statusCodes.OK;
}

export { getGroupChats, getMessages, postMessage }