const axios = require('axios');
const fs = require('fs');
const vision = require('@google-cloud/vision');
const config = require('./config');
const visionClient = new vision.ImageAnnotatorClient();
const BASE_URL = 'https://api.groupme.com/v3';
const ITEM_SEPARATOR = '\n';
const GROUPS_PATH = '/groups';
const MESSAGES_PATH = '/messages';
const TEST_GROUP_ID = '48274212'
const SEEN_LINKS_PATH = './seen_links.txt';
const GROUP_IDS_PATH = './ids.txt';
const SEEN_TEXT_PATH = './seen_text.txt';
const LAST_MESSAGE_IDS_PATH = './last_message_ids.json';
let GUID = 0;
const WAIT_TIME = 2500;
let keywords = ['party', 'girls free', 'free before', 'ladies free', 'free until', 'guys free', 'free till'];
const groupme = require('./groupme');


function isImageLink(link) {
    return link != null && link.includes('https://i.groupme.com');
}

function isEventbriteLink(link) {
    return link.includes('https') && link.includes('eventbrite');
}

async function getGroupChats() {
    const url = `${BASE_URL}${GROUPS_PATH}`;
    const params = {
        'params': {
            'token': config.GROUPME_TOKEN,
            'per_page': '200'
        }
    };
    let groups = undefined;
    try {
        const response = await axios.get(url, params);
        groups = response.data.response;
    }
    catch (error) {
        console.log('error');
    }
    return groups;
}

async function requestMessagesFromAllGroups(groupIds, groupIdToLastMessageId) {
    let messages = await Promise.all(groupIds.map( async groupId => {
        const lastMessageId = groupIdToLastMessageId[groupId];
        const groupMessages = await requestMessages(groupId, lastMessageId);
        return groupMessages;
    }));
    return messages;
}

function updateLastMessageIds(groupIds, groupsMessages, groupIdToLastMessageId){
    groupIds.forEach ( ( groupId, index ) => {
        const messages = groupsMessages[index];
        if (messages.length > 0){
            const lastMessageId = messages[messages.length - 1].id;
            groupIdToLastMessageId[groupId] = lastMessageId;
        }
    });
}

async function requestMessages(groupId, afterId){
    const url = `${BASE_URL}${GROUPS_PATH}/${groupId}${MESSAGES_PATH}`;
    const params = {
        'token': config.GROUPME_TOKEN,
        'limit': '100'
    };

    if (afterId !== undefined) {
        params['after_id'] = afterId;
    }

    let messages = [];
    try {
        const response = await axios.get(url, {params});
        if (response.status == 200) {
            messages = response.data.response.messages;
        }
    }
    catch (error) {
        console.log(error.message);
    }
    return messages;
}

function readSeenText(){
    if (fs.existsSync(SEEN_TEXT_PATH)) {
        const textBuffer = fs.readFileSync(SEEN_TEXT_PATH);
        const textsAsString = textBuffer.toString();
        const texts = textsAsString.split(ITEM_SEPARATOR);
        return new Set(texts);
    }
    return new Set();
}

async function mapImageWithText(imageLink) {
    const imageText = await getImageText(imageLink);
     return {
         'text' : imageText,
         'link' : imageLink
     };
}

function writeSeenText(texts){
    if (texts.length < 1){
        return;
    }
    const textAsOneString = texts.join(ITEM_SEPARATOR) + ITEM_SEPARATOR;
    fs.appendFile(SEEN_TEXT_PATH, textAsOneString, error => {
        if (error){
            console.log(error);
        }
    });
}

async function main() {

    if (!fs.existsSync(GROUP_IDS_PATH)) {
        const groupChats = await getGroupChats();
        const groupChatIds = groupChats.map(groupChat => groupChat.id);
        writeGroupIds(groupChatIds);
    }

    const groupIds = readGroupIds();
    const groupIdToLastMessageId = readLastMessageIds();
    let seenLinks = readSeenLinks();
    let seenTexts = readSeenText();

    while (true) {
        
        const groupsMessages = await requestMessagesFromAllGroups(groupIds, groupIdToLastMessageId);
        updateLastMessageIds(groupIds, groupsMessages, groupIdToLastMessageId);

        const messages = groupsMessages.flat();

        if (messages.length > 0) {
            saveLastMessageIds(groupIdToLastMessageId);
        }

        const imageLinks = getImageLinks(messages);
        const imageLinksWithText = await Promise.all(imageLinks.map(mapImageWithText));
        const validImageLinksWithText = getValidImageLinks(imageLinksWithText, seenTexts);
        const validTexts = validImageLinksWithText.map(item => item.text);
        writeSeenText(validTexts);
        seenTexts = new Set([...validTexts, ...seenTexts]);
        const validImageLinks = validImageLinksWithText.map(item => item.link);

        const eventbriteLinks = getEventbriteLinks(messages);

        const foundLinks = [...eventbriteLinks, ...validImageLinks];

        const uniqueLinks = getUniqueLinks(foundLinks, seenLinks);

       if (uniqueLinks.length > 0) {
            seenLinks = new Set([...seenLinks, ...uniqueLinks]);
            saveLinks(uniqueLinks);
            uniqueLinks.forEach(postLink);
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
    }

}

function getValidImageLinks(imageLinksWithText, seenTexts) {
    const validItems = imageLinksWithText.filter(item => {
        return keywords.some(keyword => {
            return item.text.includes(keyword);
        });
    });

    return validItems.filter(item => !seenTexts.has(item.text));
}

async function getImageText(imageLink) {
    let text = undefined;
    try {
        const [result] = await visionClient.textDetection(imageLink);
        const detections = result.textAnnotations;
        const words = detections.map(text => text.description);
        text = words.join('').replace(/[\n]/g, '');
    } catch (error) {
        console.log(error);
    }
    return text.toLowerCase();
}

function getImageType(imageLink) {
    if (imageLink.includes('jpeg')) {
        return 'jpeg';
    }

    if (imageLink.includes('png')) {
        return 'png';
    }
}

function readLastMessageIds() {
    if (fs.existsSync(LAST_MESSAGE_IDS_PATH)){
        const idsBuffer = fs.readFileSync(LAST_MESSAGE_IDS_PATH);
        const idsAsString = idsBuffer.toString();
        const groupIdsToLastMessageIds = JSON.parse(idsAsString);
        return groupIdsToLastMessageIds;
    }
    return {};
}

function saveLastMessageIds(groupIdToLastMessageId) {
    const idsAsJson = JSON.stringify(groupIdToLastMessageId);
    fs.writeFile(LAST_MESSAGE_IDS_PATH, idsAsJson, error => {
        if (error) {
            console.log(error);
        }
    });
}

main();

function postLink(link) {

    if (isEventbriteLink(link)) {
        const message = {
            'bot_id' : BOT_ID,
            'text' : link
        };

        const params = {
            'token' : ACCESS_TOKEN
        }

        GUID++;
        const url = `${BASE_URL}/bots/post`;
        axios.post(url, message, {params})
            .then(response => console.log(`${link} posted`))
            .catch(err => console.log(err.response));
    }

    else if (isImageLink(link)) {
        const message = {
            'bot_id' : config.BOT_ID,
            'text' : '',
            'picture_url' : link

        };
        GUID++;
        const url = `${BASE_URL}/bots/post`;
        axios.post(url, message)
            .then(response => console.log(`${link} posted`))
            .catch(err => console.log(err.response));
    }
}

function saveLinks(seenLinks) {
    const linksAsString = seenLinks.join(ITEM_SEPARATOR) + ITEM_SEPARATOR;
    fs.appendFile(SEEN_LINKS_PATH, linksAsString, error => {
        if (error) {
            throw error;
        }
    });
}

function readSeenLinks() {
    if (fs.existsSync(SEEN_LINKS_PATH)) {
        const linksBuffer = fs.readFileSync(SEEN_LINKS_PATH);
        const linksAsString = linksBuffer.toString();
        const links = linksAsString.split(ITEM_SEPARATOR);
        return new Set(links);
    }
    return new Set();
}

function writeGroupIds(groupChatIds) {
    const ids = groupChatIds.join(ITEM_SEPARATOR);
    fs.writeFileSync(GROUP_IDS_PATH, ids);
}

function readGroupIds() {
    const idsBuffer = fs.readFileSync(GROUP_IDS_PATH);
    const idsAsString = idsBuffer.toString();
    const idsAsArray = idsAsString.split(ITEM_SEPARATOR);
    return idsAsArray;
}


function getUniqueLinks(foundLinks, seenLinks) {
    const linkSet = new Set(foundLinks);
    linkSet.forEach(link => {
        if (seenLinks.has(link)) {
            linkSet.delete(link);
        }
    });
    return [...linkSet];
}

function saveImageText(imageTexts){
    const imageTextsAsStrings = imageTexts.join(ITEM_SEPARATOR) + ITEM_SEPARATOR;
    fs.writeFile(SEEN_LINKS_PATH, imageTextsAsStrings, error => {
        if (error) {
            console.log(error);
        }
    });
}

function getEventbriteLinks(messages) {
    if (messages == null) {
        return undefined;
    }
    messages = messages.filter(message => message);

    let texts = messages.map(message => message.text);
    texts = texts.filter(text => text);

    let words = texts.map(text => text.split(/[\s\n]/));
    words = words.flat();

    let links = words.filter(isEventbriteLink);

    return links;
}

function getImageLinks(messages) {
    if (messages == null) {
        return undefined;
    }
    const messagesWithLinks = messages.filter(hasImageLink);
    const imageLinks = messagesWithLinks.map(getImageLink);
    return imageLinks;
}

function hasImageLink(message) {
    if (isImageLink(message.text)){
        return true;
    }
    const attachments = message.attachments;
    if (attachments.length > 0) {
        return attachments.some(attachment => attachment.type === 'image' && attachment.url !== undefined);
    }
    return false;
}

function getImageLink(message) {
    if (isImageLink(message.text)){
        return message.text;
    }
    const attachments = message.attachments;
    const attachment = attachments.find(attachment => attachment.type === 'image');
    if (attachment === undefined) {
        console.log('how');
    }
    return attachment.url;
}