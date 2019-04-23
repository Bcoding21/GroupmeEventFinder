const axios = require('axios');
const config = require('./config');

const BASE_URL = 'https://api.groupme.com/v3';
const GROUPS_ENDPOINT = config.endpoints["GROUPS"];
const MESSAGES_ENDPOINT = config.endpoints["MESSAGES"];
const BOT_ID = config["BOT_ID"];
const ACCESS_TOKEN = config.ACCESS_TOKEN;
const MAX_MESSAGES_PER_REQUEST = config.UrlParamValues.messages["LIMIT"];

const statusCodes = {
    'OK': 200
}


/**
* @typedef {Object} Message
* @property {string} id
* @property {string} sender_id
* @property {string} name
* @property {string} sender_type
* @property {string} image_url
* @property {string} text
* @property {string} user_id
* @property {string} group_id
* @property {number} created_at
* @property {string} avatar_url
* @property {ImageAttachment | LocationAttachment []} attachments
*/

/**
 * @typedef {Object} GroupChat
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} description
 * @property {string} image_url
 */

/**
* @typedef {Object} LocationAttachment
* @property {string} type
* @property {string} lng
* @property {string} lat
* @property {string} name
*/

/**
* @typedef {Object} ImageAttachment
* @property {string} type
* @property {string} url
*/

module.exports.requestGroupChats = async function () {
    
    const url = `${BASE_URL}${GROUPS_ENDPOINT}`;
    const params = {
        'token': config.ACCESS_TOKEN,
        'per_page': config.UrlParamValues.groups.PER_PAGE
    }

    let groupChats = [];
    try {
        const response = await axios.get(url, { params });
        groupChats = response.data.response;
    } catch (error) {
        console.log(error.message);
    }
    return groupChats;
}

/**
 * @param {string} groupId
 * @param {string} afterId
 * @returns {Message[]}
 */
module.exports.getMessagesAfter = async function (groupId, afterId) {
    const requestParams = {
        'token': ACCESS_TOKEN,
        'limit': MAX_MESSAGES_PER_REQUEST
    }

    if (afterId) {
        requestParams['after_id'] = afterId;
    }
   
    let messages = [];
    const url = `${BASE_URL}${GROUPS_ENDPOINT}/${groupId}${MESSAGES_ENDPOINT}`;

    try {
        const response = await axios.get(url, { params: requestParams });
        messages = response.data.response.messages;
    } catch (error) {
        console.log(error.message);
    }

    return messages;
}

module.exports.postMessage = async function (text) {
    const body = {
        "bot_id" : BOT_ID,
        "text" : text
    }
    const params = { 'token': config.ACCESS_TOKEN };
    const url = `${BASE_URL}${config.endpoints["BOT_POST"]}`;
    const response = await axios.post(url, body, { params });
    return response.status === statusCodes.OK;
}