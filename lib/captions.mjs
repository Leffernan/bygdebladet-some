export function articleCallToAction(channel, url) {
  return channel === 'instagram'
    ? 'Les heile saka på bygdebladet.com (lenke i bio)'
    : 'Les heile saka: ' + url;
}

export function formatCaptions(text, url, instagramTags = '') {
  return {
    facebookText: [text, articleCallToAction('facebook', url)].filter(Boolean).join('\n\n'),
    instagramText: [text, articleCallToAction('instagram', url), instagramTags].filter(Boolean).join('\n\n'),
  };
}

export function splitCaption(caption, channel, url) {
  const lines = caption.split('\n');
  const linkIndex = lines.lastIndexOf(articleCallToAction(channel, url));
  if (linkIndex < 0) return { text: caption, tags: '' };

  const before = lines.slice(0, linkIndex);
  const after = lines.slice(linkIndex + 1);
  if (before.at(-1) === '') before.pop();
  if (after[0] === '') after.shift();

  const tail = after.join('\n');
  const isHashtagBlock = channel === 'instagram' && tail.trim().split(/\s+/u)
    .every(tag => /^#[\p{L}\p{M}\p{N}_]+$/u.test(tag));
  return {
    text: isHashtagBlock ? before.join('\n') : [before.join('\n'), tail].filter(Boolean).join('\n\n'),
    tags: isHashtagBlock ? tail : '',
  };
}

export function readSharedCaption(post) {
  const facebook = splitCaption(post.facebookText, 'facebook', post.url);
  const instagramBase = formatCaptions(facebook.text, post.url).instagramText;
  if (post.instagramText === instagramBase) {
    return { text: facebook.text, tags: '', differs: false };
  }
  const instagramPrefix = instagramBase + '\n\n';
  if (post.instagramText.startsWith(instagramPrefix)) {
    return { text: facebook.text, tags: post.instagramText.slice(instagramPrefix.length), differs: false };
  }

  const instagram = splitCaption(post.instagramText, 'instagram', post.url);
  return {
    text: post.channels.includes('instagram') ? instagram.text : facebook.text,
    tags: instagram.tags,
    differs: facebook.text !== instagram.text,
  };
}
