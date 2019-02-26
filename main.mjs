import * as fs from 'fs';
import * as config from './config.mjs';
import * as constants from './constants.mjs';
import * as groupme from './groupme.mjs'
import * as finder from './finder.mjs';
const ITEM_SEPARATOR = '\n';


main();

async function main() {

    if (!fs.existsSync(config.GROUP_IDS_PATH)) {
        const groupChats = await getGroupChats();
        const groupChatIds = groupChats.map(groupChat => groupChat.id);
        writeGroupIds(groupChatIds);
    }

    const groupIds = readGroupIds();
    const groupIdToLastMessageId = readLastMessageIds();
    let seenLinks = readSeenLinks();

    while (true) {

        const groupsMessages = await Promise.all(groupIds.map(async groupId => {
            const lastMessageId = groupIdToLastMessageId[groupId];
            const groupMessages = await groupme.getMessages({
                'groupId': groupId,
                'token': config.GROUPME_TOKEN,
                'limit': constants.paramValues.limit,
                'after_id': lastMessageId
            });
            return groupMessages;
        }));

        updateLastMessageIds(groupIds, groupsMessages, groupIdToLastMessageId);

        const messages = groupsMessages.flat();

        if (messages.length > 0) {
            writeLastMessageIds(groupIdToLastMessageId);
        }

        const eventbriteLinks = finder.getEventbriteLinks(messages);
        const uniqueLinks = getUniqueLinks(eventbriteLinks, seenLinks);

        if (uniqueLinks.length > 0) {
            seenLinks = new Set([...seenLinks, ...uniqueLinks]);
            writeSeenLinks(uniqueLinks);
            
            const unsentLinks = [];
            for (const link of uniqueLinks){
                let linkDidSend = false;
                try {
                    linkDidSend = groupme.postMessage({
                        'token' : config.GROUPME_TOKEN,
                        'bot_id' : config.BOT_ID,
                        'text' : link
                    });
                } catch (error) {
                    console.log(`Could not send post link.\nReason: ${error.message}`);
                }

                if (linkDidSend == false){
                    unsentLinks.push(link);
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, config.WAIT_TIME));
    }
}

function readGroupIds() {
    const idsBuffer = fs.readFileSync(config.GROUP_IDS_PATH);
    const idsAsString = idsBuffer.toString();
    const idsAsArray = idsAsString.split(ITEM_SEPARATOR);
    return idsAsArray;
}

function readLastMessageIds() {
    if (fs.existsSync(config.LAST_MESSAGE_IDS_PATH)) {
        const idsBuffer = fs.readFileSync(config.LAST_MESSAGE_IDS_PATH);
        const idsAsString = idsBuffer.toString();
        const groupIdsToLastMessageIds = JSON.parse(idsAsString);
        return groupIdsToLastMessageIds;
    }
    return {};
}

function readSeenLinks() {
    if (fs.existsSync(config.SEEN_LINKS_PATH)) {
        const linksBuffer = fs.readFileSync(config.SEEN_LINKS_PATH);
        const linksAsString = linksBuffer.toString();
        const links = linksAsString.split(ITEM_SEPARATOR);
        return new Set(links);
    }
    return new Set();
}

function writeLastMessageIds(groupIdToLastMessageId) {
    const idsAsJson = JSON.stringify(groupIdToLastMessageId);
    fs.writeFile(config.LAST_MESSAGE_IDS_PATH, idsAsJson, error => {
        if (error) {
            console.log(error);
        }
    });
}

function writeSeenLinks(seenLinks) {
    const linksAsString = seenLinks.join(ITEM_SEPARATOR) + ITEM_SEPARATOR;
    fs.appendFile(config.SEEN_LINKS_PATH, linksAsString, error => {
        if (error) {
            throw error;
        }
    });
}

function writeGroupIds(groupChatIds) {
    const ids = groupChatIds.join(ITEM_SEPARATOR);
    fs.writeFileSync(config.GROUP_IDS_PATH, ids);
}

function updateLastMessageIds(groupIds, groupsMessages, groupIdToLastMessageId) {
    groupIds.forEach((groupId, index) => {
        const messages = groupsMessages[index];
        if (messages != null && messages.length > 0) {
            const lastMessageId = messages[messages.length - 1].id;
            groupIdToLastMessageId[groupId] = lastMessageId;
        }
    });
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

async function mapImageWithText(imageLink) {
    const imageText = await getImageText(imageLink);
    return {
        'text': imageText,
        'link': imageLink
    };
}

async function getImageText(imageUrl) {
    let text = undefined;
    try {
        const [result] = await visionClient.textDetection(imageUrl);
        const detections = result.textAnnotations;
        const words = detections.map(text => text.description);
        text = words.join('').replace(/[\n]/g, '');
    } catch (error) {
        console.log(error);
    }
    return text.toLowerCase();
}