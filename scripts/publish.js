#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function getCurrentVersion() {
  return JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
}

// Build the package
function buildPackage() {
  try {
    console.log('Building package...');
    execSync('npm run build', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Error building package:', error);
    return false;
  }
}

// Publish to npm
function publishToNpm() {
  try {
    const versionStr = getCurrentVersion();

    console.log(`Publishing version ${versionStr} to npm...`);
    
    // Check if user is logged in to npm
    try {
      execSync('npm whoami', { stdio: 'pipe' });
    } catch (error) {
      console.error('You are not logged in to npm. Please run `npm login` first.');
      return false;
    }
    
    // Publish the package
    execSync('npm publish', { stdio: 'inherit' });
    console.log(`Successfully published version ${versionStr} to npm!`);
    return true;
  } catch (error) {
    console.error('Error publishing to npm:', error);
    return false;
  }
}

// Main function
function main() {
  // Options parsing
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log(`Starting npm publish process${dryRun ? ' (dry run)' : ''}...`);
  
  // Always build the package to ensure it's up to date
  if (!buildPackage()) {
    console.error('Failed to build package. Aborting publish.');
    process.exit(1);
  }
  
  // Publish to npm if not a dry run
  if (!dryRun) {
    if (publishToNpm()) {
      console.log('Publish completed successfully!');
    } else {
      console.error('Publish failed.');
      process.exit(1);
    }
  } else {
    console.log('Dry run complete. Package would have been published.');
  }
}

// Run the main function
main(); 