import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'; 
import redisClient from './redis.mjs'; 

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const usedCodes = new Set(); 

app.post('/spotify-auth', async (req, res) => {
    const { code, code_verifier, redirect_uri } = req.body;

    console.log('[POST /spotify-auth] Incoming:', { code, code_verifier, redirect_uri });

    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }

    if (usedCodes.has(code)) {
        console.warn('[POST /spotify-auth] Code reuse detected:', code);
        return res.status(400).json({ error: 'Authorization code has already been used.' });
    }

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirect_uri);
        params.append('client_id', process.env.SPOTIFY_CLIENT_ID);
        params.append('code_verifier', code_verifier);

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
            },
            body: params,
        });

        const data = await response.json();

        console.log('[POST /spotify-auth] Spotify response:', { status: response.status, data });

        if (!response.ok) {
            console.error('Spotify token exchange error:', data);
            return res.status(response.status).json(data);
        }

        usedCodes.add(code); // Mark code as used
        res.json(data);
    } catch (error) {
        console.error('Internal server error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/refresh-token', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
        const { data: profileData, error } = await supabase
            .from('profiles')
            .select('refresh_token')
            .eq('id', user.id)
            .single();

        console.log("refresh_token being sent:", profileData?.refresh_token);

        if (error || !profileData?.refresh_token) {
            throw new Error("No refresh token found for user");
        }

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: profileData.refresh_token,
                client_id: process.env.SPOTIFY_CLIENT_ID
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Spotify token refresh error:', data);
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Internal server error during token refresh:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/lyrics', async (req, res) => {
    const { title, artist } = req.query;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    console.log("hitting lyris for title:", title, "artist:", artist);

    let url = `https://lyricsapi-three.vercel.app/musixmatch/lyrics-search?title=${encodeURIComponent(title)}`;
    if (artist) url += `&artist=${encodeURIComponent(artist)}`;

    try {
        const apiRes = await fetch(url);
        const data = await apiRes.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});

// Modified API endpoint for user prompts with Redis caching
app.get('/api/user-prompts/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `prompts:${userId}`;

    try {
        // Try to get from Redis cache
        const cachedPrompts = await redisClient.get(cacheKey);
        if (cachedPrompts) {
            console.log(`[GET /api/user-prompts/${userId}] Cache hit for prompts`);
            return res.json(JSON.parse(cachedPrompts));
        }

        // If not in cache, fetch from Supabase
        console.log(`[GET /api/user-prompts/${userId}] Cache miss, fetching from Supabase`);
        const { data: prompts, error } = await supabase
            .from('user_profile_prompts')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error(`[GET /api/user-prompts/${userId}] Error fetching prompts from Supabase:`, error);
            return res.status(500).json({ error: 'Failed to fetch prompts' });
        }

        // Always store in Redis cache, even if prompts array is empty
        await redisClient.set(cacheKey, JSON.stringify(prompts || []), 'EX', 3600);
        console.log(`[GET /api/user-prompts/${userId}] Stored prompts in cache`);

        res.json(prompts);
    } catch (error) {
        console.error(`[GET /api/user-prompts/${userId}] Internal server error:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/invalidate-prompts-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `prompts:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-prompts-cache/${userId}] Prompts cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'Prompts cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-prompts-cache/${userId}] Error invalidating prompts cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/invalidate-prompts-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `prompts:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-prompts-cache/${userId}] Prompts cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'Prompts cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-prompts-cache/${userId}] Error invalidating prompts cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Modified API endpoint for Spotify Stats with Redis caching
app.get('/api/spotify-stats/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `spotify_stats:${userId}`;

    try {
        // Try to get from Redis cache
        const cachedStats = await redisClient.get(cacheKey);
        if (cachedStats) {
            console.log(`[GET /api/spotify-stats/${userId}] Cache hit for Spotify stats`);
            return res.json(JSON.parse(cachedStats));
        }

        // If not in cache, fetch from Supabase
        console.log(`[GET /api/spotify-stats/${userId}] Cache miss, fetching from Supabase`);

        const { data: topArtists, error: artistsError } = await supabase
            .from('spotify_top_artists')
            .select('*')
            .eq('user_id', userId)
            .order('slot', { ascending: true })
            .limit(3);

        const { data: playlists, error: playlistsError } = await supabase
            .from('spotify_playlists')
            .select('*')
            .eq('user_id', userId);

        const { data: topTracks, error: tracksError } = await supabase
            .from('spotify_top_tracks')
            .select('*')
            .eq('user_id', userId)
            .order('slot', { ascending: true })
            .limit(10);

        if (artistsError || playlistsError || tracksError) {
            console.error(`[GET /api/spotify-stats/${userId}] Error fetching Spotify stats from Supabase:`, artistsError || playlistsError || tracksError);
            return res.status(500).json({ error: 'Failed to fetch Spotify stats' });
        }

        const spotifyStats = {
            topArtists: topArtists || [],
            playlists: playlists || [],
            topTracks: topTracks || [],
        };

        // Always store in Redis cache, even if some arrays are empty
        await redisClient.set(cacheKey, JSON.stringify(spotifyStats), 'EX', 3600);
        console.log(`[GET /api/spotify-stats/${userId}] Stored Spotify stats in cache`);

        res.json(spotifyStats);
    } catch (error) {
        console.error(`[GET /api/spotify-stats/${userId}] Internal server error:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/invalidate-spotify-stats-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `spotify_stats:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Spotify stats cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'Spotify stats cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Error invalidating Spotify stats cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/invalidate-spotify-stats-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `spotify_stats:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Spotify stats cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'Spotify stats cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Error invalidating Spotify stats cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// New API endpoint for User Selected Tracks with Redis caching
app.get('/api/user-selected-tracks/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `user_selected_tracks:${userId}`;

    try {
        // Try to get from Redis cache
        const cachedTracks = await redisClient.get(cacheKey);
        if (cachedTracks) {
            console.log(`[GET /api/user-selected-tracks/${userId}] Cache hit for user selected tracks`);
            return res.json(JSON.parse(cachedTracks));
        }

        // If not in cache, fetch from Supabase
        console.log(`[GET /api/user-selected-tracks/${userId}] Cache miss, fetching from Supabase`);
        const { data: tracks, error } = await supabase
            .from('user_selected_tracks')
            .select('*')
            .eq('user_id', userId)
            .order('slot', { ascending: true });

        if (error) {
            console.error(`[GET /api/user-selected-tracks/${userId}] Error fetching user selected tracks from Supabase:`, error);
            return res.status(500).json({ error: 'Failed to fetch user selected tracks' });
        }

        // Store in Redis cache (e.g., for 1 hour)
        await redisClient.set(cacheKey, JSON.stringify(tracks), 'EX', 3600);
        console.log(`[GET /api/user-selected-tracks/${userId}] Stored user selected tracks in cache`);

        res.json(tracks);
    } catch (error) {
        console.error(`[GET /api/user-selected-tracks/${userId}] Internal server error:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/invalidate-spotify-stats-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `spotify_stats:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Spotify stats cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'Spotify stats cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-spotify-stats-cache/${userId}] Error invalidating Spotify stats cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// New API endpoint to invalidate User Selected Tracks cache
app.delete('/api/invalidate-user-selected-tracks-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `user_selected_tracks:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-user-selected-tracks-cache/${userId}] User selected tracks cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'User selected tracks cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-user-selected-tracks-cache/${userId}] Error invalidating user selected tracks cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// New API endpoint for User Profile with Redis caching
app.get('/api/user-profile/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `user_profile:${userId}`;

    try {
        // Try to get from Redis cache
        const cachedProfile = await redisClient.get(cacheKey);
        if (cachedProfile) {
            console.log(`[GET /api/user-profile/${userId}] Cache hit for user profile`);
            return res.json(JSON.parse(cachedProfile));
        }

        // If not in cache, fetch from Supabase
        console.log(`[GET /api/user-profile/${userId}] Cache miss, fetching from Supabase`);
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error(`[GET /api/user-profile/${userId}] Error fetching profile from Supabase:`, error);
            return res.status(500).json({ error: 'Failed to fetch user profile' });
        }

        // Store in Redis cache (e.g., for 1 hour)
        await redisClient.set(cacheKey, JSON.stringify(profile), 'EX', 3600);
        console.log(`[GET /api/user-profile/${userId}] Stored user profile in cache`);

        res.json(profile);
    } catch (error) {
        console.error(`[GET /api/user-profile/${userId}] Internal server error:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API endpoint to invalidate user profile cache
app.delete('/api/invalidate-user-profile-cache/:userId', async (req, res) => {
    const { userId } = req.params;
    const cacheKey = `user_profile:${userId}`;

    try {
        await redisClient.del(cacheKey);
        console.log(`[DELETE /api/invalidate-user-profile-cache/${userId}] User profile cache invalidated for user: ${userId}`);
        res.status(200).json({ message: 'User profile cache invalidated successfully' });
    } catch (error) {
        console.error(`[DELETE /api/invalidate-user-profile-cache/${userId}] Error invalidating user profile cache:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
