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
const WAIT_TIME = 30000;//Number.parseInt(config.WAIT_TIME) * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
console.log(WAIT_TIME);
const KEY_WORDS_FILE_PATH = 'keywords.txt';
const visionClient = new vision.ImageAnnotatorClient();
const IMAGE_URL_REGEX = /https:\/\/i.groupme.com\/[0-9]{3,4}x[0-9]{3,4}\.(jpeg|png)\.[a-zA-Z0-9]+/
const EVENTBRITE_REGEX = /https:\/\/www.eventbrite.com\/e\/[a-zA-z\-0-9]+/
const GROUP_ME_BASE_IMAGE_URL = '/i.groupme.com';
const EVENTBRITE_URL = 'eventbrite.com'
const KEYWORDS = readKeywords();

main();

async function main() {
    await ensureGroupIdsFileExist();
    const groupIds = readGroupIds();
    const groupIdToLastMessageId = readLastMessageIds();
    const keywords = readKeywords();

    while (true) {

        groupIds.forEach(async groupId => {
            const lastMessageId = groupIdToLastMessageId[groupId];
            const messages = await groupme.getMessagesAfter(groupId, lastMessageId);

            if (messages.length === 0) {
                return;
            }

            const mostRecentMessage = messages[messages.length - 1];
            const { id, group_id } = mostRecentMessage;
            groupIdToLastMessageId[group_id] = id;

            const texts = messages.map(message => {
                const text = message.text || "";
                const lowerCaseText = text.toLowerCase();
                return lowerCaseText;
            });

            getValidImageUrlsFromTexts(texts)
                .then(urls => {
                    urls.forEach(groupme.postMessage);
                });

            let attachments = messages.map(message => message.attachments);
            attachments = attachments.flat();
            getValidUrlsFromAttachments(attachments)
                .then(urls => {
                    urls.forEach(groupme.postMessage);
                });

            const links = texts.filter(text => text.includes(EVENTBRITE_URL));
            links.forEach(groupme.postMessage);
        });

        writeLastMessageIds(groupIdToLastMessageId);
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
    }
}

async function getValidUrlsFromAttachments(attachments) {
    const imageUrls = attachments
        .filter(hasImageAttachment)
        .map(getImageUrlFromAttachments);

    const results = await Promise.all(imageUrls.map(async (url) => {
        const hasKeyword = await isKeywordInImage(url);
        return hasKeyword ? url : null;
    }));

    const validUrls = results.filter(url => url); // remove nulls from list
    return validUrls;
}

async function getValidImageUrlsFromTexts(texts) {
    const imageUrls = texts.filter(hasImageUrlInText)
        .map(extractImageUrlFromText);

    const results = await Promise.all(imageUrls.map(async url => {
        const hasKeyword = await isKeywordInImage(url);
        return hasKeyword ? url : null;
    }));

    const validImageUrls = results.filter(url => url); // remove nulls from list
    return validImageUrls;
}

async function isKeywordInImage(url) {
    const textInImage = await getImageText(url);

    const textAsLowerCase =
        textInImage.toLowerCase().replace(/\W/g, '');

    const hasKeyword = KEYWORDS.some(keyword => {
        return textAsLowerCase.includes(keyword);
    });

    return hasKeyword;
}

/**
 *  
 * @param {string} text 
 * @returns {boolean}
 */
function hasImageUrlInText(text) {
    return text.includes(GROUP_ME_BASE_IMAGE_URL);
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

function hasImageAttachment(attachments) {
    return attachments.some(attachment => {
        return attachment.type === 'image';
    });
}

function getImageUrlFromAttachments(attachments) {
    const { url } = attachments.find(attachment => {
        return attachment.type == 'image';
    });
    return url;
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
        text = words.join('');
    } catch (error) {
        console.log(error);
    }
    return text;
}