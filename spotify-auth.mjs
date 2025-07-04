import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
//import { supabase } from './supabase';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

const usedCodes = new Set(); // Track used codes to prevent reuse (dev only)

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

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
