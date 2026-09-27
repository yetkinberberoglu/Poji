export const C = {
  primary:'#4F46E5', primaryDk:'#3730A3', primaryLt:'#EEF2FF',
  accent:'#7C3AED', green:'#059669', greenLt:'#D1FAE5',
  amber:'#D97706', amberLt:'#FEF3C7', red:'#DC2626', redLt:'#FEE2E2',
  teal:'#0891B2', tealLt:'#E0F2FE', dark:'#1E1B4B',
  text:'#374151', muted:'#6B7280', border:'#E0E7FF',
  bg:'#F8FAFF', bgAlt:'#EEF2FF', white:'#FFFFFF',
};
export const S = {
  sm:{shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.07,shadowRadius:4,elevation:2},
  md:{shadowColor:'#000',shadowOffset:{width:0,height:4},shadowOpacity:0.10,shadowRadius:12,elevation:5},
};
export const calcPrice = (hours: number, n: number, rate: number = 15) => {
  const exVat     = +(hours * n * rate).toFixed(2);
  const vatAmount = +(exVat * 0.18).toFixed(2);
  const service   = +(exVat + vatAmount).toFixed(2);
  const stripeFee = +(service * 0.029 + 0.30).toFixed(2);
  const clientPays= +(service + stripeFee).toFixed(2);
  const cleaner   = +(exVat * 0.80).toFixed(2);
  const platform  = +(exVat * 0.20).toFixed(2);
  return { exVat, vatAmount, service, stripeFee, clientPays, cleaner, platform };
};
