import { create } from 'zustand';
import { useCallback } from 'react';
export type Language = 'en' | 'zh';
const saved = typeof localStorage === 'undefined' ? 'en' : localStorage.getItem('poker-language');
export const useLanguage = create<{ language: Language; setLanguage: (value: Language) => void }>((set) => ({
  language: saved === 'zh' ? 'zh' : 'en',
  setLanguage: (language) => { localStorage.setItem('poker-language', language); document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; set({ language }); },
}));
if (typeof document !== 'undefined') document.documentElement.lang = saved === 'zh' ? 'zh-CN' : 'en';
const zh: Record<string,string> = {
  'English':'English', '简体中文':'简体中文', 'Desktop':'电脑', 'Mobile':'手机', 'seats':'座',
  'The ace in the pack':'好友德扑', 'ENTER':'进入牌桌', 'No real money':'仅使用虚拟筹码', '← Back':'← 返回',
  'Sign in':'登录', 'Register':'注册', 'Username':'用户名', 'Password':'密码', 'Enter a username and password':'请填写用户名和密码', 'Please wait…':'请稍候…', 'Create account':'创建账号',
  'Pick a name and pull up a chair.':'起个名字，直接入局。', 'Your name':'你的名字', 'Use the same name next time to find your seat again.':'下次用同一个名字，还能回到原来的座位。', 'Enter your name':'先填个名字。', 'Enter lobby':'进入大厅', 'Switch player':'切换玩家', 'Enter your name again':'重新输入名字', 'Session expired. Enter your name again.':'身份已过期，重新输入名字即可。', 'Name must be 20 characters or fewer':'名字最多 20 个字符。', 'Too many attempts. Try again later.':'尝试太频繁，请稍后再试。',
  'Log out':'退出登录', 'GOOD COMPANY. GREAT HANDS.':'好友相聚，打几手好牌。', 'Your seat is waiting.':'牌桌有你的座位。', 'Start a table or pull up a chair with friends.':'自己开桌，或加入朋友的牌局。', 'Virtual chips only':'只玩虚拟筹码',
  'Create a table':'开一桌', 'Hide':'收起', 'Open':'展开', 'Table name':'房间名称', 'Friday night poker':'周末牌局', 'Game mode':'玩法', 'Classic':'经典局', 'Tournament':'锦标赛', 'Automatically raise blinds':'定时升盲', 'Starting chips':'起始筹码', 'Minutes per level':'每级时长（分钟）', 'Blind levels':'盲注级别', 'Add level':'添加级别', 'Regenerate levels':'重新生成', 'Small blind':'小盲', 'Big blind':'大盲', 'Seats':'座位数', 'Create & enter':'创建并进入', 'Open tables':'可加入的牌桌', 'Loading tables…':'正在加载牌桌…', 'No tables yet.':'还没有牌桌。', 'Create the first one for your friends.':'开一桌，叫上朋友。', 'In play':'进行中', 'Waiting':'等待中', 'Paused':'已暂停', 'Closed':'已结束', 'available':'可加入', 'seated':'已入座', 'Blinds':'盲注',
  '← Lobby':'← 大厅', 'Room':'房间', 'Name':'名称', 'Chips':'筹码', 'Session':'本场', 'Chat':'聊天', 'Hide chat':'收起聊天', 'Leave seat':'离座', 'Table seats':'桌位数', 'Session & host controls':'本场数据与房主操作', 'Reconnect':'重新连接', 'Reconnecting…':'正在重连…', 'Connected. Restoring table…':'连接已恢复，正在回到牌桌…', 'Checking connection…':'检测连接…', 'Round trip:':'往返延迟：', 'Polling':'轮询', 'Pot':'底池', 'Sit':'入座',
  'Saving this hand…':'正在保存本手结果…', 'Could not save this hand. Results are not saved yet.':'本手结果保存失败。', 'Retry save':'重试保存', 'Session complete. View Session for results, or create a new table in the lobby.':'本场结束。可查看战绩，或返回大厅开新桌。', 'Session held after everyone disconnected. Cards and chips are preserved.':'大家都掉线了，牌局已暂停；手牌和筹码都已保留。', 'Resume with two players online':'两人回桌后继续', 'Waiting for the host to resume.':'等房主恢复牌局。', 'Tournament in progress · Watching':'锦标赛进行中 · 观战', 'Tap an empty seat to join':'点击空座位入座', 'Fresh chips. Same seat.':'筹码打光了？补码继续', 'Rebuy':'补码', 'Rebuy & Next hand':'补码并加入下一手', 'You are eliminated. Stay to watch the finish.':'你已出局，可以继续观战。', 'Your first hand starts next round.':'下一手即可加入。', 'Everyone folded. Show your hand?':'其他人都弃牌了，要亮牌吗？', 'Show hand':'亮牌', 'Muck':'不亮牌', 'Waiting for the winner…':'等待赢家选择是否亮牌…', 'Showing cards… Results are on their way.':'正在亮牌，结算马上就好…', 'Fold':'弃牌', 'Check':'过牌', 'Call':'跟注', 'Bet':'下注', 'Raise to':'加注至', 'All-in':'全下', 'Take a breath.':'别上头！', "You're going all-in with {chips} chips. Ready?":'这一下要押上剩余的 {chips} 筹码，确定全下吗？', 'Go all-in':'确定全下', 'Keep thinking':'再想想', 'Continuing':'准备继续', 'Take a break':'暂离', 'Ready to start':'准备开局', 'Join next hand':'加入下一手', 'Session paused':'牌局已暂停', 'The host starts when everyone is ready.':'所有人准备后，由房主开赛。', 'The first hand starts when everyone is ready.':'所有人准备后发第一手。', 'The next hand starts when everyone has closed their results.':'大家确认结算后发下一手。', 'Waiting for other players…':'等待其他玩家…',
  'Next hand':'下一手', 'Close':'关闭', 'Result':'结算', 'Total pot':'总底池', 'Main pot':'主池', 'Side pot':'边池', 'No community cards':'没有公共牌', 'Cards shown':'已亮牌', 'Everyone else folded':'其余玩家弃牌', 'You':'我', 'Offline':'离线', 'Acting':'行动中', 'Your turn':'轮到你', 'Waiting for action':'等待行动', 'Showing cards':'正在亮牌', 'Take a seat to join the next hand':'选个座位，下一手加入',
  'No messages yet':'还没有消息', 'Say something…':'说点什么…', 'Message…':'发消息…', 'Offline · Draft kept':'离线中 · 草稿已保留', 'Send':'发送', 'Sending…':'发送中…', 'Reconnect to send. Your draft is kept.':'重连后即可发送，草稿已保留。', 'Close chat':'收起聊天',
  'Keep your seat?':'保留座位吗？', 'Returning to the lobby keeps your seat and chips here. Use Leave seat between hands to take your chips out.':'返回大厅后，你的座位和筹码仍留在这桌。想带走筹码，请在两手之间离座。', 'Stay here':'留在牌桌', 'Back to lobby':'返回大厅', 'Still there?':'还在吗？', "It's your turn. If you don't respond, your hand will automatically check or fold.":'轮到你了。若一直没有回应，系统会自动过牌或弃牌。', "I'm here":'我在', 'Buy in':'买入筹码', 'Buy-in (minimum {min})':'买入筹码（最少 {min}）', 'Cancel':'取消', 'Adding chips…':'正在加入筹码…', 'Take seat':'确认入座',
  'Start tournament':'开始锦标赛', 'Resume':'恢复', 'Cancel pause':'取消暂停', 'Pause after hand':'本手结束后暂停', 'Cancel last hand':'取消最后一手', 'Last hand':'最后一手', 'End session':'结束本场', 'Call it a night?':'今晚就到这？', 'One last hand?':'再打最后一手？', 'End this session and record everyone\'s remaining chips. The table will close.':'结束本场并记录每人的剩余筹码，牌桌将关闭。', 'Play one more hand, settle the chips, then close this session. You can cancel before it settles.':'再打一手，结算后结束本场；结算前可以取消。', 'Finish this hand, settle the chips, then close this session. You can cancel before it settles.':'打完这手，结算后结束本场；结算前可以取消。',
};
Object.assign(zh, {
  'HOST':'房主', 'Table':'牌桌', 'Seat':'座位', 'Poker table':'德扑牌桌', 'Hand':'第', 'is acting':'行动中',
  'Connecting…':'正在连接…', 'Connecting to table…':'正在进入牌桌…', 'Connection is taking longer than expected. Check that the server is running.':'连接较慢，请确认房主的电脑和公网连接正在运行。', 'Cannot reach the server. Reconnecting…':'暂时无法连接，正在重试…', 'Connection lost. Reconnecting…':'连接中断，正在重连…', 'Retry':'重试', 'Sign in again':'重新登录', 'Toggle chip display':'切换筹码显示', 'Total':'合计', 'Bet amount slider':'拖动选择下注额', 'Bet amount':'下注额', 'Buy-in amount':'买入筹码数', 'Dismiss error':'关闭错误提示', 'Retrying…':'正在重试…', 'Ready':'已准备', 'Away':'暂离', 'Sitting out':'暂离中',
  'Choose your buy-in at the table':'入座时自选买入筹码', 'Everyone gets ready. The host starts. No late entries or rebuys.':'大家准备后由房主开赛；开赛后不能补码或临时入场。', 'Friends can join the next hand. Rebuy after losing all chips.':'朋友可从下一手加入；筹码打光后可补码。', 'First level follows the starting blinds. Regenerate replaces the later levels. New blinds apply next hand.':'首级盲注与开局设置一致。重新生成会覆盖后续级别；新盲注从下一手生效。', 'Remove level {n}':'删除第 {n} 级', 'Level {n}':'第 {n} 级',
  'Saving…':'保存中…', 'Results not saved':'结果尚未保存', 'Complete':'已结束', 'Next hand is the last':'下一手是最后一手', 'Pausing after this hand':'本手结束后暂停', 'Waiting for host':'等待房主', 'Level':'第', 'Final level':'最终级', 'Fixed blinds':'固定盲注', 'Final results':'本场结算', 'Around the table':'本场数据', 'TOURNAMENT':'锦标赛', 'THIS SESSION':'本场牌局', 'Equal starting chips. No late entries or rebuys.':'每人起始筹码相同，开赛后不可加入或补码。', 'Buy-in includes all rebuys. Net = chips + chips taken out − buy-in.':'买入包含所有补码；净值＝当前筹码＋已带出筹码－总买入。', 'Player':'玩家', 'Place':'名次', 'Buy-in':'买入', 'Out':'带出', 'Net':'净值', 'Playing':'进行中', 'Chips currently in the pot are included until this hand settles.':'本手未结算前，底池中的筹码仍计入玩家余额。', 'This is the last hand. The session closes after settlement.':'这就是最后一手，结算后本场结束。', 'One more hand, then the session closes. Get ready as usual.':'再打一手，本场就结束。', 'SESSION HIGHLIGHTS':'本场趣味称号', 'No qualifying highlights this session. Only settled hands count.':'本场还没有产生称号；只统计已结算的牌。', 'Just for fun · Ties are shared · This session only':'仅供娱乐 · 并列共享 · 只统计本场', 'Blind structure':'盲注结构', 'min / level':'分钟／级', 'HOST CONTROLS':'房主操作', 'Remove offline:':'移除离线玩家：', 'This session is closed. Create a new table in the lobby to start fresh.':'本场已结束，回大厅开一桌继续玩。', 'A MOMENT FOR YOURSELF':'先想清楚，再出手',
  'Pot Collector':'收池达人', 'Most hands finished with a chip gain. At least 2 wins.':'本场赢得手数最多，至少赢两手。', 'Showdown Regular':'摊牌常客', 'Most hands reached a contested showdown. At least 3 showdowns.':'参与摊牌最多，至少三次。', 'Comeback Kid':'逆风翻盘', 'Finished ahead after a settled hand put them behind. Rebuys do not count as profit.':'一度落后，最终扭亏为盈；补码不算盈利。', 'Biggest Catch':'一手大收获', 'Largest net chip gain in a single hand, including all side pots.':'单手净赢最多，包含边池。',
  'Royal flush':'皇家同花顺', 'Session expired. Please sign in again.':'登录已过期，请重新登录。', 'Incorrect username or password':'用户名或密码不正确。', 'Request failed':'请求失败，请稍后重试。', 'Username must be 2 to 20 characters':'用户名请输入 2 到 20 个字符。', 'Password must not exceed 72 characters':'密码最多 72 个字符。', 'Password must be at least 6 characters':'密码至少 6 位。', 'Username is already taken':'这个用户名已被使用。', 'Too many registration attempts. Try again later.':'注册尝试太频繁，请稍后再试。', 'Invalid room':'房间无效。', 'Room not found or closed':'房间不存在或已关闭。', 'Join a table first':'请先进入牌桌。', 'Refresh this table before acting.':'牌桌状态已变化，请刷新后再行动。', 'Too many requests. Please slow down.':'操作太频繁，请稍等。', 'Please wait before sending another message':'发消息太快了，请稍等。', 'Invalid seat':'座位无效。', 'Invalid chip amount':'筹码数无效。', 'You already have a seat':'你已经入座。', 'Seat is occupied':'这个座位有人了。', 'Invalid action':'这一步不能这样操作。', 'Enter a whole chip amount':'请输入整数筹码。', 'No hand is in progress':'当前没有进行中的牌。', 'It is not your turn':'还没轮到你。', 'You cannot act now':'现在不能行动。', 'Betting has not reopened. Call or fold.':'当前不能再加注，请跟注或弃牌。', 'You must call or fold':'请跟注或弃牌。', 'Not enough chips':'筹码不足。', 'There is a bet already; use raise':'已有下注，请选择加注。', 'Use bet instead':'请使用下注。',
  'Only the host can manage this session':'只有房主能管理本场。', 'Table is updating. Please try again.':'牌桌正在更新，请稍后再试。', 'This session has ended. Create a new table in the lobby.':'本场已结束，请回大厅开新桌。', 'This session has ended':'本场已结束。', 'Invalid ready state':'准备状态无效。', 'Waiting for settlement to be saved':'正在保存结算，请稍等。', 'Take a seat first':'请先入座。', 'Wait until the hand ends to get ready':'等这手结束后再准备。', 'Buy in again to play':'补码后才能继续玩。', 'You have been eliminated':'你已出局。', 'Only the winner can choose to show cards':'只有赢家能选择是否亮牌。', 'Session held after everyone disconnected. Ask the host to resume.':'大家都掉线后牌局已暂停，请房主恢复。', 'At least two players must return before resuming':'至少两位玩家回来后才能恢复。', 'Players disconnected during resume. Wait for two players to return.':'恢复时又有人掉线，请等两位玩家回来。', 'The table has changed. Review the current action and try again.':'牌桌状态已更新，请确认后再操作。', 'End the session between hands':'请在两手之间结束本场。', 'Only the host can remove offline seats':'只有房主能移除离线座位。', 'Only offline seats can be removed':'只能移除离线座位。', 'Remove offline seats between hands':'请在两手之间移除离线座位。',
  'One more hand, then the session closes. Close the results to continue.':'再打一手本场就结束，确认本手结算后继续。',
});
function translateDynamic(key: string): string | undefined {
  const hand = key.match(/^(Straight flush|Four of a kind|Full house|Flush|Straight|Three of a kind|Two pair) \(([^)]+)\)$/);
  if (hand) {
    const rank = hand[2].replace(' high', '');
    if (hand[1] === 'Straight flush') return `${rank} 高同花顺`;
    if (hand[1] === 'Flush') return `${rank} 高同花`;
    if (hand[1] === 'Straight') return `${rank} 高顺子`;
    if (hand[1] === 'Four of a kind') return `四条 ${rank}`;
    if (hand[1] === 'Three of a kind') return `三条 ${rank}`;
    if (hand[1] === 'Full house') {
      const [three, pair] = rank.split(' over ');
      return `${three} 葫芦 ${pair}`;
    }
    const [first, second] = rank.split(' and ');
    return `两对 ${first}、${second}`;
  }
  const pair = key.match(/^Pair of (.+)$/); if (pair) return `一对 ${pair[1]}`;
  const high = key.match(/^High card (.+)$/); if (high) return `高牌 ${high[1]}`;
  const action = key.match(/^(.*) (folds|checks|calls|bets \d+|raises \(\+\d+ chips\)|all-in)$/);
  if (action) {
    const word = action[2];
    return `${action[1]}${word === 'folds' ? '弃牌' : word === 'checks' ? '过牌' : word === 'calls' ? '跟注' : word === 'all-in' ? '全下' : word.startsWith('bets ') ? `下注 ${word.slice(5)}` : `加注 ${word.match(/\d+/)?.[0] ?? ''}`}`;
  }
  const wins = key.match(/^(\d+) winning hands$/); if (wins) return `赢了 ${wins[1]} 手`;
  const showdowns = key.match(/^(\d+) showdowns$/); if (showdowns) return `摊牌 ${showdowns[1]} 次`;
  const scoop = key.match(/^\+(\S+) chips in one hand$/); if (scoop) return `单手净赢 ${scoop[1]} 筹码`;
  const net = key.match(/^Net: −(\S+) → \+(\S+)$/); if (net) return `净值从 −${net[1]} 回到 +${net[2]}`;
}
export function localize(language: Language, key: string, values: Record<string,string|number> = {}): string {
  const template = language === 'zh' ? zh[key] ?? translateDynamic(key) ?? key : key;
  return template.replace(/\{(\w+)\}/g,(_,name:string)=>String(values[name] ?? ''));
}
export function useT() { const language = useLanguage((s)=>s.language); return useCallback((key:string,values?:Record<string,string|number>)=>localize(language,key,values),[language]); }

