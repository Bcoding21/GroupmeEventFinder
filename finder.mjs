//const vision = require('@google-cloud/vision');
//const visionClient = new vision.ImageAnnotatorClient();

const HTTP_URL_SCHEME = 'http';
const EVENTBRITE = 'eventbrite';
const IMAGE_URL_REGEX = /https:\/\/i.groupme.com\/\d{0,5}x\d{0,5}.(jpeg|png).[A-Za-z\d]+/g;
const DELIMINATOR_REGEX = /[\s\n]/g;


export function getEventbriteLinks(messages) {
    if (messages == null) {
        return undefined;
    }
    const texts = messages.filter(message => message != null)
        .map(message => message.text)
        .filter(text => text != null);

    const links = texts.map(text => text.split(DELIMINATOR_REGEX))
        .flat().filter(isEventbriteLink);

    return links;
}

function isEventbriteLink(link) {
    return link.includes('http') && link.includes('eventbrite');
}


async function getLinks(messages) {
    if (messages == null) {
        return null;
    }

    const messagesWithImages = messages.filter(finder.hasImage);
    const imageLinks = messagesWithImages.map(finder.getImageUrl);
    const imageLinksWithText = await Promise.all(imageLinks.map(mapImageWithText));
    const validImageLinksWithText = getValidImageLinks(imageLinksWithText, seenTexts);
    const validTexts = validImageLinksWithText.map(item => item.text);
    writeSeenText(validTexts);
    seenTexts = new Set([...validTexts, ...seenTexts]);
    const validImageLinks = validImageLinksWithText.map(item => item.link);

    const eventbriteLinks = getEventbriteLinks(messages);

    const foundLinks = [...eventbriteLinks, ...validImageLinks];

    const uniqueLinks = getUniqueLinks(foundLinks, seenLinks);

    let imageLinks = getImageLinks(messages);

    const eventbriteLinks = getEventbriteLinks(messages);

}

function getImageLinks(messages) {
    if (messages == null) {
        return null;
    }
    const messagesWithImageLinks = messages.filter(hasImage);
    const imageLinks = messagesWithImageLinks.map(getImageUrl);
    return imageLinks;
}
function hasImage(message) {
    if (!(message && message.text)) {
        return false;
    }

    if (message.text.match(IMAGE_URL_REGEX)) {
        return true;
    }

    const attachments = message.attachments;
    const hasImage = attachments.some(attachment => {
        return attachment.type === 'image';
    });
    return hasImage;
}

function getImageUrl(message) {
    if (!(message && message.text)) {
        return null;
    }

    const imageUrls = message.text.match(IMAGE_URL_REGEX);
    if (imageUrls) {
        return imageUrls[0];
    }

    const attachments = message.attachments;
    const attachment = attachments.find(attachment => {
        return attachment.type === 'image';
    });

    return attachment != null ? attachment.url : null;
}

async function getValidImageLinks(imageLinks) {
    
}