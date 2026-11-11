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

/** @param {string | null} [editedTags] */
export function splitCaption(caption, channel, url, editedTags = null) {
  const lines = caption.split('\n');
  const linkIndex = lines.lastIndexOf(articleCallToAction(channel, url));
  if (linkIndex < 0) return { text: caption, tags: '' };

  const before = lines.slice(0, linkIndex);
  const after = lines.slice(linkIndex + 1);
  if (before.at(-1) === '') before.pop();
  if (after[0] === '') after.shift();

  const tail = after.join('\n');
  const isHashtagBlock = channel === 'instagram' && (editedTags === tail || tail.trim().split(/\s+/u)
    .every(tag => /^#[\p{L}\p{M}\p{N}_]+$/u.test(tag)));
  return {
    text: isHashtagBlock ? before.join('\n') : [before.join('\n'), tail].filter(Boolean).join('\n\n'),
    tags: isHashtagBlock ? tail : '',
  };
}
