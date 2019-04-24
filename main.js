/* eslint-disable no-console */
const fs = require('fs');
const vision = require('@google-cloud/vision');
const groupme = require('./groupme');
const ITEM_SEPARATOR = '\n';
const config = require('./config.json');

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
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const WAIT_TIME = Number.parseInt(config.WAIT_TIME) * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
console.log(WAIT_TIME);
const KEY_WORDS_FILE_PATH = 'keywords.txt';
const visionClient = new vision.ImageAnnotatorClient();
const IMAGE_URL_REGEX = /https:\/\/i.groupme.com\/[0-9]{3,4}x[0-9]{3,4}\.(jpeg|png)\.[a-zA-Z0-9]+/
const EVENTBRITE_REGEX = /https:\/\/www.eventbrite.com\/e\/[a-zA-z\-0-9]+/
const GROUP_ME_BASE_IMAGE_URL = '/i.groupme.com';
const EVENTBRITE_URL = 'eventbrite.com'

main();

async function main() {
    await ensureGroupIdsFileExist();
    const groupIds = readGroupIds();
    const groupIdToLastMessageId = readLastMessageIds();
    const keywords = readKeywords();

    while (true) {
        const groupsMessagesPromises = groupIds.map(async groupId => {
            const lastMessageId = groupIdToLastMessageId[groupId];
            const messages = await groupme.getMessagesAfter(groupId, lastMessageId);
            return messages;
        });

        const groupsMessages = await Promise.all(groupsMessagesPromises);

        groupsMessages.forEach(messages => {
            if (messages.length === 0) {
                return;
            }
            const mostRecentMessage = messages[messages.length - 1];
            const { id, group_id } = mostRecentMessage;
            groupIdToLastMessageId[group_id] = id;
        });

        const messages = groupsMessages.flat();
        const didFindNewMessages = messages.length > 0;
        console.log('---------------');
        if (didFindNewMessages) {
            console.log(`new Messages found: ${messages.length}`);
            writeLastMessageIds(groupIdToLastMessageId);

            messages.forEach(ensureTextExist);
            messages.forEach(message => message.text = message.text.toLowerCase());


            getValidImageUrlsFromText(messages, keywords)
                .then(urls => {
                    console.log(`Urls from text: ${urls.length}`);
                    urls.forEach(groupme.postMessage);
                });

            getValidUrlsFromAttachments(messages, keywords)
                .then(urls => {
                    console.log(`Urls from attachments: ${urls.length}`);
                    urls.forEach(groupme.postMessage);
                });

            const links = getEventbriteLinks(messages);
            console.log(`Eventbrite links: ${links.length}`);
            links.forEach(groupme.postMessage);
        }
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
    }
}

/**
 * @param {Message[]} messages
 * @returns {string[]}
 */
function getEventbriteLinks(messages) {
    return messages
        .map(message => message.text)
        .filter(text => text.includes(EVENTBRITE_URL))
}

/**
 * @param {Message[]} messages 
 * @param {string[]} keywords
 * @returns {Promise<string[]>} 
 */
async function getValidUrlsFromAttachments(messages, keywords) {
    const imageUrls = messages
        .filter(message => message.attachments.length > 0)
        .filter(hasImageAttachment)
        .map(getImageUrlFromAttachment);

    const promises = imageUrls.map(async (url) => {
        let imageText = await getImageText(url);
        imageText = imageText.toLowerCase();

        const hasKeyword = keywords.some(keyword => {
            return imageText.includes(keyword);
        });
        return hasKeyword ? url : null;
    });

    let validUrls = await Promise.all(promises);
    validUrls = validUrls.filter(url => url);
    return validUrls;
}

/**
 * 
 * @param {Message[]} messages 
 * @param {string[]} keywords
 * @returns {Promise<string[]>} 
 */
async function getValidImageUrlsFromText(messages, keywords) {
    const imageUrls = messages
        .filter(message => message.text)
        .map(message => message.text)
        .filter(hasImageUrlInText)
        .map(extractImageUrlFromText);

    let validImageUrls = await Promise.all(imageUrls.map(async (url) => {
        let imageText = await getImageText(url);
        imageText = imageText.toLowerCase();

        const hasKeyword = keywords.some(keyword => {
            return imageText.includes(keyword);
        });
        return hasKeyword ? url : null;
    }));

    validImageUrls = validImageUrls.filter(url => url);
    return validImageUrls;
}

/**
 *  
 * @param {string} text 
 * @returns {boolean}
 */
function hasImageUrlInText(text) {
    return text.includes(GROUP_ME_BASE_IMAGE_URL);
}

function ensureTextExist(message) {
    message.text = message.text || "";
}

/**
 * 
 * @param {string} text 
 * @returns {string}
 */
function extractImageUrlFromText(text) {
    const matches = text.match(IMAGE_URL_REGEX);
    return matches[0] || null;
}

async function ensureGroupIdsFileExist() {
    const group_ids_path = config.saveFiles["GROUP_IDS_PATH"];

    if (!fs.existsSync(group_ids_path)) {
        const groupChats = await groupme.requestGroupChats();
        const groupChatIds = groupChats.map(groupChat => groupChat.id);
        const ids = groupChatIds.join(ITEM_SEPARATOR);
        fs.writeFileSync(config.saveFiles.GROUP_IDS_PATH, ids);
    }
}

function readGroupIds() {
    const group_ids_path = config.saveFiles["GROUP_IDS_PATH"];
    const idsBuffer = fs.readFileSync(group_ids_path);
    const idsAsString = idsBuffer.toString();
    const idsAsArray = idsAsString.split(ITEM_SEPARATOR);
    return idsAsArray;
}

function readLastMessageIds() {
    let groupIdsToLastMessageIds = {};
    const messages_seen_path = config.saveFiles["LAST_MESSAGE_IDS_PATH"];

    if (fs.existsSync(messages_seen_path)) {
        const idsBuffer = fs.readFileSync(messages_seen_path);
        const idsAsString = idsBuffer.toString();

        try {
            groupIdsToLastMessageIds = JSON.parse(idsAsString);
        } catch (error) {
            console.log(error);
        }
    }
    return groupIdsToLastMessageIds;
}

function readSeenLinks() {
    const seen_links_path = config.saveFiles["SEEN_LINKS_PATH"];
    if (fs.existsSync(seen_links_path)) {
        const linksBuffer = fs.readFileSync(seen_links_path);
        const linksAsString = linksBuffer.toString();
        const links = linksAsString.split(ITEM_SEPARATOR);
        return new Set(links);
    }
    return new Set();
}

function readKeywords() {
    const buffer = fs.readFileSync(KEY_WORDS_FILE_PATH);
    const keywordsAsString = buffer.toString();
    const keywords = keywordsAsString.split('\r' + ITEM_SEPARATOR);
    return keywords;
}

function writeLastMessageIds(groupIdToLastMessageId) {
    const idsAsJson = JSON.stringify(groupIdToLastMessageId);
    const messages_seen_path = config.saveFiles["LAST_MESSAGE_IDS_PATH"];
    fs.writeFile(messages_seen_path, idsAsJson, error => {
        if (error) {
            throw error;
        }
    });
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
    const attachment = message.attachments.find(attachment => {
        return attachment.type == 'image';
    });
    return attachment ? attachment.url : null;
}

/**
 * 
 * @param {string} imageUrl 
 * @returns {string}
 */
async function getImageText(imageUrl) {
    let text = "";
    try {
        const [result] = await visionClient.textDetection(imageUrl);
        const detections = result.textAnnotations;
        const words = detections.map(text => text.description);
        text = words.join('').replace(/[\n]/g, '');
    } catch (error) {
        console.log(error);
    }
    return text;
}