const express = require('express');
const axios = require('axios');
const { formatDomainUrl } = require('../utils');

const router = express.Router();

router.post('/validate', async (req, res) => {
    const { domain, apiToken, email } = req.body;
    console.log('Validating credentials for domain:', domain);

    try {
        const formattedDomain = formatDomainUrl(domain);
        console.log('Formatted domain:', formattedDomain);
        
        const response = await axios({
            method: 'get',
            url: `${formattedDomain}/rest/api/space`,
            headers: {
                'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
                'Accept': 'application/json'
            },
            params: {
                limit: 1
            }
        });

        if (response.status === 200 && response.data && response.data.results) {
            console.log('Validation successful');
            res.json({ 
                success: true,
                message: 'Credentials validated successfully'
            });
        } else {
            console.log('Validation failed: Unexpected response format');
            res.status(401).json({ 
                success: false, 
                error: 'Invalid credentials or unexpected response format'
            });
        }
    } catch (error) {
        console.error('Authentication error:', error.message);
        console.error('Error response:', error.response?.data);
        
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to authenticate with Confluence';
        
        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage
        });
    }
});

module.exports = router;
