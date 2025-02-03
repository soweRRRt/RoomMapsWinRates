const axios = require('axios');

const API_KEY = 'ce5c7213-e7b0-4aa4-b94f-56651e4e4e4a';
const URL = 'https://open.faceit.com/data/v4/matches/1-9f16e3d2-3024-4a42-92bd-cc1066b95e72';

async function scrapeData() {
    try {
        const response = await axios.get(URL, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        // console.log(response);

        const roster1 = response.data.teams.faction1.roster;
        const roster2 = response.data.teams.faction2.roster;

        const mapStatsTeam1 = {};
        const mapStatsTeam2 = {};

        const roster = [...roster1, ...roster2];

        for (const element of roster) {
            const params = {
                offset: 0,
                limit: 50
            };

            // if (element.nickname === 'ForTeens01')
            //     console.log(element.player_id);

            const res = await axios.get(`https://open.faceit.com/data/v4/players/${element.player_id}/games/cs2/stats`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                },
                params: params,
            });

            // console.log(res);

            const mapStats = {};

            res.data.items.forEach(item => {
                // console.log(item.stats); // Выводим статистику для диагностики
                const mapName = item.stats.Map;

                const isTeam1 = roster1.some(player => player.player_id === element.player_id);
                const mapStatsTeam = isTeam1 ? mapStatsTeam1 : mapStatsTeam2;

                if (item.stats['Game Mode'] === '5v5' && item.stats.Rounds > 16
                    && item.stats['First Half Score'] !== '0' && item.stats['First Half Score'] !== '12') {

                    if (!mapStats[mapName]) {
                        mapStats[mapName] = { totalMatches: 0, totalWins: 0, totalLoses: 0, kds: 0.0 };
                    }

                    if (!mapStatsTeam[mapName]) {
                        mapStatsTeam[mapName] = { totalMatches: 0, totalWins: 0, totalLoses: 0, kds: 0.0 };
                    }

                    mapStats[mapName].kds += parseFloat(item.stats['K/D Ratio']);
                    mapStats[mapName].totalMatches++;

                    mapStatsTeam[mapName].kds += parseFloat(item.stats['K/D Ratio']);
                    mapStatsTeam[mapName].totalMatches++;

                    if (item.stats.Result === '1') {
                        mapStats[mapName].totalWins++;
                        mapStatsTeam[mapName].totalWins++;
                    }
                    else {
                        mapStats[mapName].totalLoses++;
                        mapStatsTeam[mapName].totalLoses++;
                    }
                }
            });

            console.log(`Статистика для игрока ${element.nickname}:`);
            for (const map in mapStats) {
                const winRate = Math.round((mapStats[map].totalWins / mapStats[map].totalMatches) * 100);
                const averageKD = (mapStats[map].kds / mapStats[map].totalMatches).toFixed(2);
                console.log(`${map} \t WR: ${winRate}% \t KD: ${averageKD} \t Матчей: ${mapStats[map].totalMatches} \t Побед: ${mapStats[map].totalWins} \t Поражений: ${mapStats[map].totalLoses}`);
            }
            console.log(`=========================================`);
        }
        // Выводим средний винрейт по картам для первой команды
        const team1Nicknames = roster1.map(player => player.nickname).join(', ');
        console.log(`Средний винрейт по картам для команды (${team1Nicknames}):`);
        for (const map in mapStatsTeam1) {
            const winRate = Math.round((mapStatsTeam1[map].totalWins / mapStatsTeam1[map].totalMatches) * 100);
            const averageKD = (mapStatsTeam1[map].kds / mapStatsTeam1[map].totalMatches).toFixed(2);
            console.log(`${map} \t WR: ${winRate}% \t KD: ${averageKD} \t Матчей: ${mapStatsTeam1[map].totalMatches} \t Побед: ${mapStatsTeam1[map].totalWins} \t Поражений: ${mapStatsTeam1[map].totalLoses}`);
        }

        console.log(`=========================================`);

        // Выводим средний винрейт по картам для второй команды
        const team2Nicknames = roster2.map(player => player.nickname).join(', ');
        console.log(`Средний винрейт по картам для команды (${team2Nicknames}):`);
        for (const map in mapStatsTeam2) {
            const winRate = Math.round((mapStatsTeam2[map].totalWins / mapStatsTeam2[map].totalMatches) * 100);
            const averageKD = (mapStatsTeam2[map].kds / mapStatsTeam2[map].totalMatches).toFixed(2);
            console.log(`${map} \t WR: ${winRate}% \t KD: ${averageKD} \t Матчей: ${mapStatsTeam2[map].totalMatches} \t Побед: ${mapStatsTeam2[map].totalWins} \t Поражений: ${mapStatsTeam2[map].totalLoses}`);
        }
    } catch (error) {
        console.error('Ошибка при сборе данных:', error.message);
    }
}

scrapeData();