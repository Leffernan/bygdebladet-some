export function canApprove(post, expectedRevision, checks) {
  if(post.revision !== expectedRevision) throw new Error('Posten er endret. Last inn den nyeste versjonen før godkjenning.');
  if(post.state !== 'draft') throw new Error('Bare utkast kan godkjennes.');
  if(!post.channels.length) throw new Error('Velg minst én kanal.');
  if(!post.title.trim() || !post.imageUrl) throw new Error('Tittel og bilde mangler.');
  if(post.channels.includes('instagram') && post.instagramText.length > 2200) throw new Error('Instagram-teksten kan ha maks 2200 tegn.');
  if(!checks?.content || !checks?.credit || !checks?.privacy) throw new Error('Kontroller tittel og utsnitt, fotokreditt og personvern før godkjenning.');
  return true;
}
export function mayPublish(post, delivery) {
  return post.state === 'approved' && post.approved_revision === post.revision && !!post.image_key && !!post.approved_by &&
    delivery.revision === post.revision && post.channels.includes(delivery.channel) && ['ready','failed'].includes(delivery.state);
}
export function editable(deliveries) { return !deliveries.some(d=>['sending','unknown','published','processing'].includes(d.state)); }
export function osloSlot(date = new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const minutes=Number(parts.hour)*60+Number(parts.minute);
  const slot=[360,780,1020,1290].find(t=>minutes>=t && minutes<t+55);
  return slot == null ? null : `${parts.year}-${parts.month}-${parts.day}-${slot}`;
}
