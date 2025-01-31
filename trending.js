let currentPage = 1;
const tokensPerPage = 12;
let isLoading = false;
let debounceTimer;
let lastFetchTime = 0;
const FETCH_COOLDOWN = 2000; // 2 seconds cooldown between refreshes

async function fetchTrendingTokens() {
    const now = Date.now();
    if (isLoading || (now - lastFetchTime < FETCH_COOLDOWN)) return;
    
    try {
        isLoading = true;
        updateLoadingState(true);
        lastFetchTime = now;

        // Add headers and mode to the fetch request
        const options = {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors'  // Explicitly set CORS mode
        };

        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=solana-ecosystem&order=volume_desc&per_page=100&page=1&sparkline=false', options);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Initial tokens:', data.length);

        // Increased batch size to 25
        const batchSize = 25;
        const tokensWithDetails = [];
        
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchPromises = batch.map(async (token) => {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay further
                    
                    // Add same headers to detail requests
                    const detailResponse = await fetch(
                        `https://api.coingecko.com/api/v3/coins/${token.id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
                        options
                    );
                    
                    if (!detailResponse.ok) {
                        throw new Error(`Failed to fetch ${token.id}`);
                    }
                    
                    const detailData = await detailResponse.json();
                    
                    // Extract links
                    const links = {
                        twitter: detailData.links?.twitter_screen_name ? `https://twitter.com/${detailData.links.twitter_screen_name}` : null,
                        discord: Array.isArray(detailData.links?.chat_url) ? detailData.links.chat_url.find(url => url.includes('discord')) : null,
                        website: Array.isArray(detailData.links?.homepage) ? detailData.links.homepage[0] : null,
                        telegram: detailData.links?.telegram_channel_identifier ? `https://t.me/${detailData.links.telegram_channel_identifier}` : null
                    };

                    return {
                        ...token,
                        links: links
                    };
                } catch (error) {
                    console.error(`Error fetching details for ${token.id}:`, error);
                    // Return token with null links instead of skipping
                    return {
                        ...token,
                        links: { twitter: null, discord: null, website: null, telegram: null }
                    };
                }
            });

            try {
                const batchResults = await Promise.all(batchPromises);
                tokensWithDetails.push(...batchResults);
                
                // Update the display after each batch
                displayTokenData(tokensWithDetails);
                
                // Cache the current results
                localStorage.setItem('tokenData', JSON.stringify(tokensWithDetails));
                localStorage.setItem('lastFetchTime', now.toString());
                
                // Minimal delay between batches
                await new Promise(resolve => setTimeout(resolve, 200));
                
                console.log(`Loaded ${tokensWithDetails.length} tokens so far`);
            } catch (error) {
                console.error('Batch error:', error);
                // Continue with next batch even if current batch fails
                continue;
            }
        }

        console.log('Final tokens with details:', tokensWithDetails.length);

        // Final display update
        displayTokenData(tokensWithDetails);

    } catch (error) {
        console.error('Error:', error);
        
        // Try to use cached data if available
        const cachedData = localStorage.getItem('tokenData');
        if (cachedData) {
            console.log('Using cached data');
            displayTokenData(JSON.parse(cachedData));
        } else {
            // Show error message if no cached data
            document.querySelector('.token-grid').innerHTML = `
                <div class="col-span-full text-center text-red-500 p-4">
                    Unable to load tokens. Please check your internet connection and try again.<br>
                    <button onclick="retryFetch()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        Retry
                    </button>
                </div>
            `;
        }
    } finally {
        isLoading = false;
        updateLoadingState(false);
    }
}

function displayTokenData(data) {
    if (!Array.isArray(data)) {
        throw new Error('Invalid data structure received');
    }

    const filteredData = data
        .filter(token => token.id && token.symbol)
        .map(token => ({
            id: token.id,
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            image: token.image,
            price: token.current_price || 0,
            priceChange: token.price_change_percentage_24h || 0,
            volume: token.total_volume || 0,
            marketCap: token.market_cap || 0,
            links: token.links || {}
        }));

    const tokenGrid = document.querySelector('.token-grid');
    const startIndex = (currentPage - 1) * tokensPerPage;
    const endIndex = startIndex + tokensPerPage;
    const pageTokens = filteredData.slice(startIndex, endIndex);

    if (tokenGrid && pageTokens.length > 0) {
        tokenGrid.innerHTML = pageTokens.map(token => `
            <div class="token-card bg-[#1e293b] hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 rounded-xl shadow-2xl p-4 border border-gray-700 transition-all duration-300">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-16 h-16 rounded-full shadow-md bg-gray-800 flex items-center justify-center">
                            <img src="${token.image}" 
                                 alt="${token.symbol}"
                                 class="w-full h-full rounded-full object-cover"
                                 onerror="this.outerHTML='<div class=\'w-16 h-16 rounded-full shadow-md bg-gray-800 flex items-center justify-center text-2xl font-bold text-white\'>${token.symbol.charAt(0)}</div>'">
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-xl font-bold text-white">${token.symbol}</h3>
                            </div>
                            <p class="text-gray-400">${token.name}</p>
                            <p class="text-gray-400">Price: $${formatNumber(token.price)}</p>
                            <p class="text-gray-400">24h: <span class="${token.priceChange >= 0 ? 'text-green-500' : 'text-red-500'}">${token.priceChange.toFixed(2)}%</span></p>
                            <p class="text-gray-400">Volume: $${formatNumber(token.volume)}</p>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="openChart('${token.id}')" 
                                class="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors w-24">
                            Chart
                        </button>
                        <button onclick="openTrade('${token.id}')"
                                class="px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-md hover:bg-green-600 transition-colors w-24">
                            Trade
                        </button>
                        ${token.links.twitter ? `
                            <a href="${token.links.twitter}" target="_blank" 
                               class="px-4 py-2 text-sm font-medium text-white bg-[#1DA1F2] rounded-md hover:bg-[#1a8cd8] transition-colors w-24 text-center">
                                Twitter
                            </a>
                        ` : ''}
                        ${token.links.discord ? `
                            <a href="${token.links.discord}" target="_blank" 
                               class="px-4 py-2 text-sm font-medium text-white bg-[#5865F2] rounded-md hover:bg-[#4752c4] transition-colors w-24 text-center">
                                Discord
                            </a>
                        ` : ''}
                        ${token.links.website ? `
                            <a href="${token.links.website}" target="_blank" 
                               class="px-4 py-2 text-sm font-medium text-white bg-[#4b5563] rounded-md hover:bg-[#374151] transition-colors w-24 text-center">
                                Website
                            </a>
                        ` : ''}
                        ${token.links.telegram ? `
                            <a href="${token.links.telegram}" target="_blank" 
                               class="px-4 py-2 text-sm font-medium text-white bg-[#0088cc] rounded-md hover:bg-[#0077b3] transition-colors w-24 text-center">
                                Telegram
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        updatePagination(currentPage, Math.ceil(filteredData.length / tokensPerPage));
    }
}

function updatePagination(current, total) {
    document.querySelector('.pagination').innerHTML = `
        <div class="flex justify-center gap-4 mt-8">
            <button onclick="changePage(${current - 1})" 
                    class="px-4 py-2 text-sm font-medium text-white bg-[#1e293b] rounded-md hover:bg-blue-600 transition-colors"
                    ${current === 1 ? 'disabled' : ''}>
                Previous
            </button>
            <span class="px-4 py-2 text-sm font-medium text-white">
                Page ${current} of ${total}
            </span>
            <button onclick="changePage(${current + 1})" 
                    class="px-4 py-2 text-sm font-medium text-white bg-[#1e293b] rounded-md hover:bg-blue-600 transition-colors"
                    ${current === total ? 'disabled' : ''}>
                Next
            </button>
        </div>
    `;
}

function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + 'B';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

function openChart(id) {
    window.open(`https://www.coingecko.com/en/coins/${id}`, '_blank');
}

function openTrade(id) {
    window.open(`https://jup.ag/swap/SOL-${id}`, '_blank');
}

function changePage(newPage) {
    if (isLoading) return;
    
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
        if (newPage >= 1) {
            currentPage = newPage;
            fetchTrendingTokens();
        }
    }, 300);
}

function updateLoadingState(isLoading) {
    const tokenGrid = document.querySelector('.token-grid');
    if (isLoading && tokenGrid) {
        tokenGrid.innerHTML = `
            <div class="col-span-full text-center text-white p-4">
                <div class="animate-pulse">Loading tokens... Please wait</div>
            </div>
        `;
    }
}

function retryFetch() {
    console.log('Retrying fetch...');
    fetchTrendingTokens();
}

// Modified event listener
document.addEventListener('DOMContentLoaded', () => {
    fetchTrendingTokens();
    // Refresh every 30 seconds if not manually refreshed
    setInterval(() => {
        const now = Date.now();
        const lastFetch = parseInt(localStorage.getItem('lastFetchTime') || '0');
        if (!isLoading && (now - lastFetch >= 30000)) {
            fetchTrendingTokens();
        }
    }, 30000);
}); 