import { useState, useRef, useCallback } from 'react';
import { User, ScaleLevel, UserPresence } from '@/types';
import { supabase } from '@/lib/supabaseClient';

const RANDOM_NAMES = [
    '流浪的小星', '极光行者', '深海潜航', '赛步诗人', '夜幕幽灵', '霓虹信使', '虚空观察者', '重力叛逆者', '光速速递', '量子纠缠',
    '云端漫步', '像素浪人', '磁卡狂热', '电子蝴蝶', '光谱漫游', '暗物质', '临界点', '高维度', '波函数', '奇点降临',
    '二进制福音', '硅基生命', '星际难民', '轨道咖啡师', '黑洞视界', '以太漫游者', '中子星', '反物质', '脉冲信号', '宇宙微波',
    '晨曦之光', '暮色苍茫', '清风拂面', '细雨湿衣', '明月清风', '白云深处', '绿野仙踪', '荒野镖客', '雾都孤儿', '冰川孤岛',
    '落花流水', '星辰大海', '山间清泉', '林间小路', '海边拾贝', '雪地足迹', '秋风扫落叶', '春泥护花', '夕阳无限', '朝霞满天',
    '北极星的眼泪', '珊瑚礁', '热带雨林', '沙漠之花', '极光之吻', '深秋的蝉', '初雪的午后', '盛夏的蝉鸣', '冬日的暖阳', '春天的第一场雨',
    '幻影骑士', '星空旅人', '机械迷城', '未来之子', '时空猎人', '梦幻西游', '绝地求生', '英雄联盟', '守望先锋', '暗黑破坏神',
    '魔兽世界', '我的世界', '饥荒之影', '泰拉瑞亚', '空洞骑士', '赛尔达', '马里奥', '皮卡丘', '宝可梦', '勇者斗恶龙',
    '最终幻想', '辐射废土', '废土余生', '星露谷', '动物森友会', '死亡搁浅', '战神', '刺客信条', '古墓丽影', '生化危机',
    '漫步者', '哈尔的移动城堡', '幽灵公主', '千与千寻', '龙猫', '红猪', '天空之城', '崖上的波妞', '借物少女', '起风了',
    '风之谷', '夏日大作战', '狼的孩子雨和雪', '怪物的孩子', '未来的未来', '龙和雀斑公主', '穿越时空的少女', '红辣椒', '千年女优', '东京教父',
    '完美的蓝', '新世纪福音战士', '攻壳机动队', '阿基拉', '大友克洋', '押井守', '今敏', '细田守', '新海诚', '宫崎骏',
    '塔可夫斯基的镜子', '费里尼的 8 部半', '黑泽明的梦', '希区柯克的后窗', '王家卫的罐头', '贾木许的咖啡', '库布里克的巨石', '韦斯安德森的对称', '诺兰的陀螺', '维伦纽瓦的沙丘',
    '低俗小说', '搏击俱乐部', '发条橙', '肖申克的救赎', '霸王别姬', '重庆森林', '花样年华', '海上钢琴师', '天堂电影院', '辛德勒的名单',
    '香菜排斥者', '抹茶控', '芝士就是力量', '螺狮粉爱好者', '火锅英雄', '焦糖布丁', '冰美式灵魂', '提拉米苏', '由于太好吃', '流心蛋黄',
    '炭烤和牛', '刺身拼盘', '舒芙蕾', '马卡龙', '章鱼小丸子', '关东煮', '麻辣烫执行官', '手冲咖啡师', '波波奶茶', '甜甜圈爱好者',
    '孤独的读书人', '巷子里的猫', '深夜食堂', '半路出家', '灵魂画师', '无聊的艺术家', '爱做梦的人', '时光机', '平行时空', '昨日重现',
    '慵懒的下午茶', '一个人的旅行', '路边的长椅', '雨后的柏油路', '街角的书店', '凌晨四点的城市', '温暖的围巾', '被窝里的微光', '窗边的风铃', '旋转木马',
    '薛定谔的猫', '尼采的超人', '萨特的自由', '柏拉图的洞穴', '西西弗斯的巨石', '加缪的荒诞', '笛卡尔的怀疑', '维特根斯坦的沉默', '福柯的钟摆', '德勒兹的褶皱',
    '傲娇的布偶猫', '发呆的企鹅', '打哈欠的树懒', '爱笑的柴犬', '跳舞的火烈鸟', '潜水的蓝鲸', '觅食的小松鼠', '睡觉的小刺猬', '玩毛线的幼猫', '爱干净的小浣熊',
    '柯基短腿', '哈士奇的咆哮', '熊猫滚滚', '长颈鹿的远眺', '小狐狸的尾巴', '猫头鹰的守候', '考拉的抱抱', '水獭的牵手', '海信的小海豚', '大象的长鼻子',
    '无名氏', '路人甲', '吃瓜群众', '潜水员', '快乐星球', '忧郁的蓝', '热情的红', '宁静的绿', '纯真的白', '深邃的黑',
    '失眠飞行', '梦游仙境', '幻觉实验室', '记忆碎片', '逻辑悖论', '非线性思维', '主观能动性', '客观存在', '偶然性', '必然结果'
];

export const useGMLogic = (
    currentUser: User,
    setCurrentUser: React.Dispatch<React.SetStateAction<User>>,
    setTempName: (name: string) => void,
    setShowUnifiedSettings: (show: boolean) => void,
    onlineUsers: Record<ScaleLevel, UserPresence[]>
) => {
    const [gmClickCount, setGmClickCount] = useState(0);
    const [gmClickTimer, setGmClickTimer] = useState<NodeJS.Timeout | null>(null);
    const [showGmPrompt, setShowGmPrompt] = useState(false);
    const [gmPassword, setGmPassword] = useState('');
    const [isGmLoggingIn, setIsGmLoggingIn] = useState(false);

    const handleLogoClick = useCallback(() => {
        if (currentUser.isGM) return;

        setGmClickCount(prev => {
            const newCount = prev + 1;
            if (newCount >= 5) {
                setShowGmPrompt(true);
                return 0;
            }
            return newCount;
        });

        if (gmClickTimer) clearTimeout(gmClickTimer);
        const timer = setTimeout(() => {
            setGmClickCount(0);
        }, 2000); // Reset count after 2s of inactivity
        setGmClickTimer(timer);
    }, [currentUser.isGM, gmClickTimer]);

    const handleGmLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (gmPassword !== '123' || !supabase) {
            alert('密码错误或系统未就绪');
            setGmPassword('');
            return;
        }

        setIsGmLoggingIn(true);
        try {
            // Single GM Session Check
            const { data: settings } = await supabase.from('site_settings').select('value_text').eq('key', 'gm_active_user_id').single();

            if (settings?.value_text && settings.value_text !== currentUser.id) {
                const isAnotherGmOnline = Object.values(onlineUsers).flat().some((p: any) => p.isGM && p.user_id !== currentUser.id);

                if (isAnotherGmOnline) {
                    if (!confirm('检测到已有另一位特工老蔡在线（可能是您在其他设备上的会话）。是否强制接管该身份？')) {
                        setShowGmPrompt(false);
                        setGmPassword('');
                        setIsGmLoggingIn(false);
                        return;
                    }
                }
            }

            // Set GM Status
            const gmUser: User = {
                ...currentUser,
                name: '老蔡',
                isGM: true
            };

            setCurrentUser(gmUser);
            localStorage.setItem('whisper_user_name', '老蔡');

            // Update site_settings
            await supabase.from('site_settings').upsert({ key: 'gm_active_user_id', value_text: currentUser.id, updated_at: new Date().toISOString() });

            setShowGmPrompt(false);
            setGmPassword('');
            alert('超级权限已激活，指挥官。');
        } catch (err) {
            console.error('GM Login Error:', err);
        } finally {
            setIsGmLoggingIn(false);
        }
    };

    const handleLogoutGM = () => {
        if (!currentUser.isGM) return;

        const newName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
        const guestUser: User = {
            ...currentUser,
            name: newName,
            isGM: false
        };

        setCurrentUser(guestUser);
        setTempName(newName);
        localStorage.setItem('whisper_user_name', newName);

        setShowUnifiedSettings(false);
        alert('已成功退出超级权限，您现在是普通用户。');
    };

    return {
        gmClickCount,
        showGmPrompt,
        setShowGmPrompt,
        gmPassword,
        setGmPassword,
        isGmLoggingIn,
        handleLogoClick,
        handleGmLogin,
        handleLogoutGM,
        RANDOM_NAMES // Exported for use elsewhere if needed
    };
};
