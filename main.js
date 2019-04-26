/* eslint-disable no-console */
const fs = require('fs');
const googleCloudVision = require('@google-cloud/vision');
const groupmeFunctions = require('./groupme');
const ITEM_SEPARATOR = '\n';
const config = require('./config.json');

const cloudVisionClient = new googleCloudVision.ImageAnnotatorClient();
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const WAIT_TIME = Number.parseInt(config.WAIT_TIME) * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
const KEY_WORDS_FILE_PATH = 'keywords.txt';
const IMAGE_URL_REGEX = /https:\/\/i.groupme.com\/[0-9]{3,4}x[0-9]{3,4}\.(jpeg|png)\.[a-zA-Z0-9]+/
const GROUP_ME_BASE_IMAGE_URL = '/i.groupme.com';
const EVENTBRITE_URL = 'eventbrite.com';
const KEYWORDS = readKeywords();

main();

async function main() {
    await ensureGroupIdsFileExist();
    const groupIds = readGroupIds();
    const groupIdToLastMessageId = readLastMessageIds();

    while (true) {
        const eachGroupsMessages = await requestAllGroupsMessages(groupIds, groupIdToLastMessageId);
        updateLastMessageIds(eachGroupsMessages, groupIdToLastMessageId);
        saveLastMessageIds(groupIdToLastMessageId);

        const messages = eachGroupsMessages.flat();
        ensureMessagesHaveLowerCaseText(messages);

        console.log('-----------------');
        console.log(`Message count ---> ${messages.length}`);

        getValidImageUrlsFromText(messages).then( urls => {
            console.log(`Urls from text ---> ${urls.length}`);
            urls.forEach(groupmeFunctions.postMessage);
        });

        getValidImageUrlsFromAttachments(messages).then( urls => {
            console.log(`Urls from attachments ---> ${urls.length}`);
            urls.forEach(groupmeFunctions.postMessage);
        });

        const eventbriteLinks = getEventbriteLinks(messages);   
        eventbriteLinks.forEach(groupmeFunctions.postMessage);

        console.log(`Eventbrite links ---> ${eventbriteLinks.length}`);

        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
    }
}

/**
 * Forces messages to have empty text if null
 * Then converts any text to lowercase.
 * @param {Message[]} messages list of messages form a group chat
 */
function ensureMessagesHaveLowerCaseText(messages) {
    messages.forEach(message => {
        message.text = message.text || "";
        message.text = message.text.toLowerCase();
    });
}

/**
 * 
 * @param {string[]} groupIds list of group ids
 * @param {Map<string, string>} groupIdToLastMessageId map of group ids to 
 * the id of the most recent message.
 * @returns {Message[][]} list messages from each group 
 */
async function requestAllGroupsMessages(groupIds, groupIdToLastMessageId) {
    const promises = groupIds.map(async groupId => {
        const mostRecentMessageId = groupIdToLastMessageId.get(groupId);
        const messages = await groupmeFunctions.getMessagesAfter(groupId, mostRecentMessageId);
        return messages;
    });
    const eachGroupsMessages = await Promise.all(promises);
    return eachGroupsMessages;
}

/**
 * Checks if group id file exist. If not it request
 * group chat ids from group me and writes them to 
 * a file. Does nothing if file exist
 */
async function ensureGroupIdsFileExist() {
    const group_ids_path = config.saveFiles["GROUP_IDS_PATH"];

    if (!fs.existsSync(group_ids_path)) {
        const groupChats = await groupmeFunctions.requestGroupChats();
        const groupChatIds = groupChats.map(groupChat => groupChat.id);
        const ids = groupChatIds.join(ITEM_SEPARATOR);
        fs.writeFileSync(config.saveFiles.GROUP_IDS_PATH, ids);
    }
}

/**
 * Reads group ids from file synchrnously
 * @returns {string[]} list of group ids
 */
function readGroupIds() {
    const group_ids_path = config.saveFiles["GROUP_IDS_PATH"];
    const idsBuffer = fs.readFileSync(group_ids_path);
    const idsAsString = idsBuffer.toString();
    const idsAsArray = idsAsString.split(ITEM_SEPARATOR);
    return idsAsArray;
}

/**
 * reads key value pairings of group ids and message ids
 * @returns {Map<string, string>} group chat ids mapped 
 * to the id of most recent message in that group chat
 */
function readLastMessageIds() {
    let groupIdsToLastMessageIds = new Map();
    const messages_seen_path = config.saveFiles["LAST_MESSAGE_IDS_PATH"];

    if (fs.existsSync(messages_seen_path)) {
        const fileContent = fs.readFileSync(messages_seen_path);
        const fileContentAsString = fileContent.toString();
        try {
            const contentAsObject = JSON.parse(fileContentAsString);
            groupIdsToLastMessageIds = new Map(contentAsObject);
        } catch (error) {
            console.log(error);
        }
    }
    return groupIdsToLastMessageIds;
}

/**
 * reads keywords from a file.
 * @returns {string[]} returns list of words
 */
function readKeywords() {
    const buffer = fs.readFileSync(KEY_WORDS_FILE_PATH);
    return buffer.toString().split('\r' + ITEM_SEPARATOR);
}

/**
 * saves the group chat id and message id in a json file
 * @param {Map<string,string} groupIdToLastMessageId map of group chat id to
 * id of most recent message in the group chat
 * @throws {NodeJS.ErrnoException}
 */
function saveLastMessageIds(groupIdToLastMessageId) {
    const json = JSON.stringify([...groupIdToLastMessageId]);
    const lastMessagesIdFilePath = config.saveFiles["LAST_MESSAGE_IDS_PATH"];

    fs.writeFile(lastMessagesIdFilePath, json, error => {
        if (error) {
            throw error;
        }
    });
}

/**
 * Returns list of urls whose images contain
 * any of the list of keywords.
 * @param {Message[]} messages list of messages
 * @param {string[]} keywords list of words
 * @returns {Promise<string[]>} list of urls
 */
async function getValidImageUrlsFromAttachments(messages) {
    const imageUrls = messages
        .filter(hasImageAttachment)
        .map(getImageUrlFromAttachment);

    const results = await Promise.all(imageUrls.map(async (url) => {
        const hasKeyword = await isKeywordInImage(url);
        return hasKeyword ? url : null;
    }));

    const validUrls = results.filter(url => url);
    return validUrls;
}

/**
 * Returns list of urls whose images contain
 * any of the list of keywords.
 * @param {Message[]} messages list of messges
 * @param {Promise<string[]>} keywords list of keywords
 * @returns {string[]} urls that contained keywords
 */
async function getValidImageUrlsFromText(messages) {
    const imageUrls = messages
        .map(message => message.text)
        .filter(hasImageUrl)
        .map(extractImageUrl);

    const results = await Promise.all(imageUrls.map(async (url) => {
        const hasKeyword = await isKeywordInImage(url);
        return hasKeyword ? url : null;
    }));

    const validUrls = results.filter(url => url);
    return validUrls;
}

/**
 * Determines if the the text in the image
 * has keywords.
 * @param {string} url url of image
 * @param {string[]} keywords list of words
 * @returns {Promise<boolean>}
 */
async function isKeywordInImage(url) {
    let imageText = await parseText(url);
    imageText = imageText.toLowerCase().replace(/[\W_]+/g, '');

    const hasKeyword = KEYWORDS.some(keyword => {
        return imageText.includes(keyword);
    });
    return hasKeyword;
}

/**
 * Replaces the last most recent message id with newer message ids
 * @param {Message[][]} groupsMessages represents each groups messages
 * @param {Map<string,string>} groupIdToLastMessageId group chat ids
 * mapped to the most recent message ids
 */
function updateLastMessageIds(groupsMessages, groupIdToLastMessageId) {
    groupsMessages.forEach(messages => {
        if (messages.length === 0) {
            return;
        }
        const mostRecentMessage = messages[messages.length - 1];
        const { id, group_id } = mostRecentMessage;
        groupIdToLastMessageId.set(group_id, id);
    });
}

/**
 * Extracts eventbrite links from list of messages
 * @param {Message[]} messages
 * @returns {string[]} list of texts with 
 * eventbrites links in them
 */
function getEventbriteLinks(messages) {
    return messages
        .map(message => message.text)
        .filter(text => text.includes(EVENTBRITE_URL))
}

/**
 *  
 * @param {string} text 
 * @returns {boolean}
 */
function hasImageUrl(text) {
    return text.includes(GROUP_ME_BASE_IMAGE_URL);
}

/**
 * 
 * @param {string} text 
 * @returns {string}
 */
function extractImageUrl(text) {
    const matches = text.match(IMAGE_URL_REGEX);
    return matches[0] || null;
}

/**
 * 
 * @param {Message} message 
 */
function hasImageAttachment(message) {
    return message.attachments.some(attachment => {
        return attachment.type === 'image';
    });
}

/**
 * 
 * @param {Message} message 
 * @returns {ImageAttachment}
 */
function getImageUrlFromAttachment(message) {
    const { url } = message.attachments.find(attachment => {
        return attachment.type == 'image';
    });
    return url;
}

/**
 * Attempts to read any textual information in
 * an image.
 * @param {string} imageUrl url for an image
 * @returns {string} text that could be interpreted form the image
 */
async function parseText(imageUrl) {
    let text = "";
    try {
        const [result] = await cloudVisionClient.textDetection(imageUrl);
        const detections = result.textAnnotations;
        const words = detections.map(text => text.description);
        text = words.join('');
    } catch (error) {
        console.log(error);
    }
    return text;
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
* @typedef {Object} ImageAttachment
* @property {string} type
* @property {string} url
*/