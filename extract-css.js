const fs = require('fs');
const path = require('path');

// Component files to analyze
const componentFiles = [
    'src/renderer/components/BackupSection.tsx',
    'src/renderer/components/Header.tsx',
    'src/renderer/components/Snackbar.tsx',
    'src/renderer/components/DeviceStatusCard.tsx',
    'src/renderer/components/ModeSwitchModal.tsx',
    'src/renderer/components/AutomatedBackupManager.tsx'
];

// Main CSS file
const cssFile = 'src/renderer/styles/main.scss';

// Extract className values from component files
function extractClassNames(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const classNames = new Set();
    
    // Match className="..." and className={`...`}
    const classNameRegex = /className\s*=\s*(?:"([^"]+)"|{`([^`]+)`|{['"]([^'"]+)['"]|{\s*`([^`]*)`\s*})/g;
    
    let match;
    while ((match = classNameRegex.exec(content)) !== null) {
        const classNameValue = match[1] || match[2] || match[3] || match[4];
        if (classNameValue) {
            // Handle template literals and conditional classes
            const cleanedValue = classNameValue
                .replace(/\$\{[^}]+\}/g, '') // Remove template literal expressions
                .replace(/\s+/g, ' ')        // Normalize whitespace
                .trim();
            
            // Split by spaces and filter out non-class strings
            cleanedValue.split(' ').forEach(cls => {
                cls = cls.trim();
                if (cls && !cls.includes('${') && !cls.includes('?') && !cls.includes(':')) {
                    classNames.add(cls);
                }
            });
        }
    }
    
    return Array.from(classNames);
}

// Extract CSS rules for specific classes
function extractCSSRules(cssContent, classNames) {
    const rules = [];
    const lines = cssContent.split('\n');
    let currentRule = '';
    let braceCount = 0;
    let inRule = false;
    let ruleStartLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentRule += line + '\n';
        
        // Count braces to track rule boundaries
        const openBraces = (line.match(/{/g) || []).length;
        const closeBraces = (line.match(/}/g) || []).length;
        braceCount += openBraces - closeBraces;
        
        if (!inRule && openBraces > 0) {
            inRule = true;
            ruleStartLine = i;
        }
        
        if (inRule && braceCount === 0) {
            // Check if this rule contains any of our target classes
            const ruleHeader = currentRule.split('{')[0];
            const hasTargetClass = classNames.some(className => {
                return ruleHeader.includes('.' + className) || 
                       ruleHeader.includes(className + ' ') ||
                       ruleHeader.includes(className + ':') ||
                       ruleHeader.includes(className + ',') ||
                       ruleHeader.includes(className + '{');
            });
            
            if (hasTargetClass) {
                rules.push(currentRule.trim());
            }
            
            currentRule = '';
            inRule = false;
        }
    }
    
    return rules;
}

// Main execution
function main() {
    console.log('Extracting CSS classes from components...\n');
    
    const allClassNames = new Set();
    
    // Extract class names from each component
    componentFiles.forEach(file => {
        const fullPath = path.join(__dirname, file);
        if (fs.existsSync(fullPath)) {
            console.log(`Analyzing ${file}...`);
            const classNames = extractClassNames(fullPath);
            console.log(`Found classes: ${classNames.join(', ')}\n`);
            classNames.forEach(cls => allClassNames.add(cls));
        } else {
            console.log(`Warning: ${file} not found\n`);
        }
    });
    
    console.log(`Total unique classes found: ${allClassNames.size}`);
    console.log(`Classes: ${Array.from(allClassNames).sort().join(', ')}\n`);
    
    // Read main CSS file
    const cssPath = path.join(__dirname, cssFile);
    if (!fs.existsSync(cssPath)) {
        console.error(`CSS file not found: ${cssFile}`);
        return;
    }
    
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    console.log('Extracting matching CSS rules...\n');
    
    // Extract relevant CSS rules
    const relevantRules = extractCSSRules(cssContent, Array.from(allClassNames));
    
    console.log(`Found ${relevantRules.length} matching CSS rules\n`);
    
    // Generate new CSS file content
    const newCSSContent = `/* Material Design 3 System - Components CSS */
/* Extracted CSS for: BackupSection, Header, Snackbar, DeviceStatusCard, ModeSwitchModal, AutomatedBackupManager */

/* CSS Variables */
:root {
    --md-primary: #F9A825;
    --md-primary-dark: #F57F17;
    --md-primary-container: #fff8e1;
    --md-on-primary: #ffffff;
    --md-on-primary-container: #3e2723;

    --md-surface: #fffbfe;
    --md-surface-container: #f7f2fa;
    --md-surface-container-high: #f1ecf4;
    --md-surface-variant: #e7e0ec;
    --md-on-surface: #1c1b1f;
    --md-on-surface-variant: #49454f;

    --md-outline: #79747e;
    --md-outline-variant: #cac4d0;

    --md-error: #ba1a1a;
    --md-success: #00c851;
    --md-warning: #ff9800;

    --md-elevation-1: 0px 1px 3px rgba(0, 0, 0, 0.12);
    --md-elevation-2: 0px 2px 6px rgba(0, 0, 0, 0.16);
    --md-elevation-3: 0px 4px 8px rgba(0, 0, 0, 0.20);

    --md-spacing-xs: 4px;
    --md-spacing-sm: 8px;
    --md-spacing-md: 16px;
    --md-spacing-lg: 24px;
    --md-spacing-xl: 32px;
    --md-spacing-xxl: 48px;

    --md-border-radius-sm: 4px;
    --md-border-radius-md: 8px;
    --md-border-radius-lg: 12px;
    --md-border-radius-xl: 16px;
    --md-border-radius-pill: 20px;
}

/* Reset */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Roboto', system-ui, sans-serif;
    background-color: var(--md-surface);
    color: var(--md-on-surface);
    line-height: 1.5;
}

/* Component-specific CSS Rules */
${relevantRules.join('\n\n')}
`;
    
    // Write the new CSS file
    const outputPath = path.join(__dirname, 'src/renderer/styles/main_new.css');
    fs.writeFileSync(outputPath, newCSSContent);
    
    console.log(`✅ CSS extraction complete!`);
    console.log(`📁 New CSS file created: ${outputPath}`);
    console.log(`📊 Extracted ${relevantRules.length} CSS rules for ${allClassNames.size} classes`);
    
    // Log summary
    console.log('\n=== SUMMARY ===');
    console.log('Components analyzed:', componentFiles.length);
    console.log('Unique CSS classes found:', allClassNames.size);
    console.log('CSS rules extracted:', relevantRules.length);
    console.log('Output file: src/renderer/styles/main_new.css');
}

if (require.main === module) {
    main();
}
