const IMAGE_LINK_BEGINNING = '';


async function requestMessagesFromAllGroups(){

}

async function requestMessages(){

}

function getImageLink(message){
    if (message == null) {
        
    }
}

function hasImageLink(message){
    if (message == null){
        return false;
    }

    if (isImageLink(message.text)){
        return true;
    }
    const attachments = message.attachments;

    if (attachments.length > 0) {
        
        return attachments.some(attachment => attachment.type === 'image' && attachment.url !== undefined);
    }
    return false;
}
