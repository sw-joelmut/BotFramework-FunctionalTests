
export const getTimestamp = () => {
  const today = new Date();
  const ss = String(today.getSeconds()).padStart(2, '0')
  const mm = String(today.getMinutes()).padStart(2, '0')
  const HH = String(today.getHours()).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0');
  const MM = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = String(today.getFullYear());

  return `[${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}]`
}
