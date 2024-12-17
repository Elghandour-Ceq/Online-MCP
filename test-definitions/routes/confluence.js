const express = require('express');
const { makeAuthenticatedRequest, fetchAllChildTypes, getTotalSpaceCount } = require('../utils');

const router = express.Router();

router.get('/spaces', async (req, res) => {
    const start = Math.max(0, parseInt(req.query.start || 0, 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 25, 10)));
    
    console.log('Fetching spaces with params:', { start, limit });
    
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());
        
        // First, get the total count of spaces
        const totalSize = await getTotalSpaceCount(credentials);
        console.log('Total space count:', totalSize);

        // Then get the requested page of spaces
        const response = await makeAuthenticatedRequest(
            credentials,
            '/rest/api/space',
            { 
                start,
                limit,
                status: 'current',
                expand: 'description.plain,metadata.labels'
            }
        );

        // Log the response details
        console.log('Spaces response:', {
            requestedStart: start,
            requestedLimit: limit,
            actualStart: response.data.start,
            actualLimit: response.data.limit,
            resultCount: response.data.results.length,
            totalSize: totalSize
        });

        // Return response with the correct total size
        res.json({
            results: response.data.results,
            start: response.data.start,
            limit: response.data.limit,
            size: totalSize || response.data.size,
            _links: response.data._links
        });
    } catch (error) {
        console.error('Failed to fetch spaces:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch spaces';
        res.status(statusCode).json({ error: errorMessage });
    }
});

router.get('/pages', async (req, res) => {
    const { spaceKey } = req.query;
    
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());

        console.log('Fetching space information...');
        const spaceResponse = await makeAuthenticatedRequest(
            credentials,
            `/rest/api/space/${spaceKey}`,
            {
                expand: 'homepage'
            }
        );

        if (!spaceResponse.data.homepage) {
            throw new Error('No homepage found for space');
        }

        console.log('Fetching homepage content...');
        const homepageResponse = await makeAuthenticatedRequest(
            credentials,
            `/rest/api/content/${spaceResponse.data.homepage.id}`,
            {
                expand: 'body.storage,version,space,ancestors,children.page,children.attachment,children.comment,children.folder,children.whiteboard,children.embed'
            }
        );

        res.json(homepageResponse.data);
    } catch (error) {
        console.error('Failed to fetch space content:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch space content';
        res.status(statusCode).json({ error: errorMessage });
    }
});

router.get('/pages/:pageId/children', async (req, res) => {
    const { pageId } = req.params;
    
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());

        console.log('Fetching all child types...');
        const allChildren = await fetchAllChildTypes(credentials, pageId);

        res.json({
            embed: allChildren.embed,
            folder: allChildren.folder,
            page: allChildren.page,
            attachment: allChildren.attachment,
            whiteboard: allChildren.whiteboard,
            comment: allChildren.comment
        });
    } catch (error) {
        console.error('Failed to fetch page children:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch page children';
        res.status(statusCode).json({ error: errorMessage });
    }
});

router.get('/pages/:pageId/html', async (req, res) => {
    const { pageId } = req.params;
    
    try {
        const credentials = JSON.parse(Buffer.from(req.headers['x-confluence-credentials'], 'base64').toString());

        // First, get the page content and space information
        console.log('Fetching page content...');
        const contentResponse = await makeAuthenticatedRequest(
            credentials,
            `/rest/api/content/${pageId}`,
            {
                expand: 'body.storage,space'
            }
        );

        if (!contentResponse.data.body?.storage?.value) {
            throw new Error('No content found for page');
        }

        const spaceKey = contentResponse.data.space?.key;
        if (!spaceKey) {
            throw new Error('No space information found for page');
        }

        // Then convert it to view format
        console.log('Converting content...');
        const convertResponse = await makeAuthenticatedRequest(
            credentials,
            '/rest/api/contentbody/convert/view',
            {},
            'POST',
            {
                value: contentResponse.data.body.storage.value,
                representation: 'storage',
                spaceKeyContext: spaceKey,
                contentIdContext: pageId,
                embeddedContentRender: "current"
            }
        );

        if (!convertResponse.data?.value) {
            throw new Error('Failed to convert content');
        }

        // Return the HTML content with basic styling
        const styledHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${contentResponse.data.title}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 900px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    img {
                        max-width: 100%;
                        height: auto;
                    }
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 1em 0;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f5f5f5;
                    }
                    code {
                        background-color: #f5f5f5;
                        padding: 2px 4px;
                        border-radius: 3px;
                        font-family: monospace;
                    }
                    pre {
                        background-color: #f5f5f5;
                        padding: 1em;
                        border-radius: 5px;
                        overflow-x: auto;
                    }
                    .confluence-information-macro {
                        background: #f4f5f7;
                        border-radius: 3px;
                        margin: 1em 0;
                        padding: 1em;
                    }
                    .confluence-information-macro-title {
                        font-weight: bold;
                        margin-bottom: 0.5em;
                    }
                    .confluence-information-macro-body {
                        margin: 0;
                    }
                    .aui-icon {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        margin-right: 5px;
                        vertical-align: middle;
                    }
                    .status-macro {
                        display: inline-block;
                        padding: 2px 5px;
                        border-radius: 3px;
                        font-size: 12px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <h1>${contentResponse.data.title}</h1>
                ${convertResponse.data.value}
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(styledHtml);
    } catch (error) {
        console.error('Failed to fetch page HTML:', error);
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || 'Failed to fetch page HTML';
        res.status(statusCode).json({ error: errorMessage });
    }
});

module.exports = router;
