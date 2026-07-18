import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

const buildBoxStyle = ({
    paddingTop = 0,
    paddingRight = 0,
    paddingBottom = 0,
    paddingLeft = 0,
    marginTop = 0,
    marginRight = 0,
    marginBottom = 0,
    marginLeft = 0,
    backgroundColor = '',
    backgroundMode = 'default',
    borderWidth = 0,
    borderStyle = 'solid',
    borderColor = '',
    borderRadius = 0,
    width = '',
    height = '',
    minHeight = '',
}) => {
    const style = { boxSizing: 'border-box' };
    if (Number.isFinite(Number(paddingTop)) && Number(paddingTop) > 0) { style.paddingTop = `${Number(paddingTop)}px`; }
    if (Number.isFinite(Number(paddingRight)) && Number(paddingRight) > 0) { style.paddingRight = `${Number(paddingRight)}px`; }
    if (Number.isFinite(Number(paddingBottom)) && Number(paddingBottom) > 0) { style.paddingBottom = `${Number(paddingBottom)}px`; }
    if (Number.isFinite(Number(paddingLeft)) && Number(paddingLeft) > 0) { style.paddingLeft = `${Number(paddingLeft)}px`; }
    if (Number.isFinite(Number(marginTop)) && Number(marginTop) > 0) { style.marginTop = `${Number(marginTop)}px`; }
    if (Number.isFinite(Number(marginRight)) && Number(marginRight) > 0) { style.marginRight = `${Number(marginRight)}px`; }
    if (Number.isFinite(Number(marginBottom)) && Number(marginBottom) > 0) { style.marginBottom = `${Number(marginBottom)}px`; }
    if (Number.isFinite(Number(marginLeft)) && Number(marginLeft) > 0) { style.marginLeft = `${Number(marginLeft)}px`; }
    if (backgroundMode === 'custom' && backgroundColor) {
        style.backgroundColor = backgroundColor;
    } else if (backgroundMode === 'default') {
        style.background = 'linear-gradient(135deg, rgba(14, 116, 144, 0.12), rgba(37, 99, 235, 0.08))';
        style.border = '1px solid rgba(148, 163, 184, 0.22)';
        style.borderRadius = '14px';
    }
    if (Number.isFinite(Number(borderWidth)) && Number(borderWidth) > 0) {
        style.borderWidth = `${Number(borderWidth)}px`;
        style.borderStyle = borderStyle || 'solid';
        if (borderColor) {
            style.borderColor = borderColor;
        }
    }
    if (Number.isFinite(Number(borderRadius)) && Number(borderRadius) > 0) {
        style.borderRadius = `${Number(borderRadius)}px`;
    }
    if (width) {
        style.width = width;
    }
    if (height) {
        style.height = height;
    }
    if (minHeight) {
        style.minHeight = minHeight;
    }
    return style;
};

export function ImageBlockEdit({ attributes = {}, setAttributes, clientId }) {
    const {
        imageId,
        imageUrl = '',
        alt = 'NodeLogic image',
        imageWidth = '',
        imageHeight = '',
        imageScaleX = 1,
        imageScaleY = 1,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundEnabled = false,
        backgroundColor = '',
        backgroundMode,
        borderWidth = 0,
        borderStyle = 'solid',
        borderColor = '',
        borderRadius = 0,
        width = '',
        height = '',
        minHeight = '',
    } = attributes;

    useEffect(() => {
        if (!imageId) {
            setAttributes({ imageId: `nodelogic_img_${String(clientId || uuid()).slice(0, 8)}` });
        }
    }, [imageId, clientId, setAttributes]);

    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');
    const wrapperStyle = buildBoxStyle({
        paddingTop: paddingTop ?? attributes.padding ?? 12,
        paddingRight: paddingRight ?? attributes.padding ?? 12,
        paddingBottom: paddingBottom ?? attributes.padding ?? 12,
        paddingLeft: paddingLeft ?? attributes.padding ?? 12,
        marginTop: marginTop ?? attributes.margin ?? 0,
        marginRight: marginRight ?? attributes.margin ?? 0,
        marginBottom: marginBottom ?? attributes.margin ?? 0,
        marginLeft: marginLeft ?? attributes.margin ?? 0,
        backgroundColor,
        backgroundMode: resolvedBackgroundMode,
        borderWidth,
        borderStyle,
        borderColor,
        borderRadius,
        width,
        height,
        minHeight,
    });

    return (
        <>
            <InspectorControls>
                <PanelBody title="Image Settings" initialOpen>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="ID"
                        value={imageId}
                        onChange={(value) => setAttributes({ imageId: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Image URL"
                        value={imageUrl}
                        onChange={(value) => setAttributes({ imageUrl: value })}
                        help="The graph can override this source at runtime."
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Alt text"
                        value={alt}
                        onChange={(value) => setAttributes({ alt: value })}
                    />
                    <div style={{ fontWeight: 600, marginBottom: '6px', marginTop: '12px' }}>Image Dimensions</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Image Width" value={String(imageWidth || '')} onChange={(value) => setAttributes({ imageWidth: value })} placeholder="e.g., 200px or 100%" />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Image Height" value={String(imageHeight || '')} onChange={(value) => setAttributes({ imageHeight: value })} placeholder="e.g., 200px or auto" />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Scale X" type="number" step="0.1" value={String(imageScaleX || 1)} onChange={(value) => setAttributes({ imageScaleX: Number(value) || 1 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Scale Y" type="number" step="0.1" value={String(imageScaleY || 1)} onChange={(value) => setAttributes({ imageScaleY: Number(value) || 1 })} />
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>Padding</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(paddingTop ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingTop: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(paddingRight ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingRight: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(paddingBottom ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingBottom: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(paddingLeft ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingLeft: Number(value) || 0 })} />
                    </div>
                    <SelectControl
                        __next40pxDefaultSize
                        label="Background mode"
                        value={resolvedBackgroundMode}
                        options={[{ label: 'Default background', value: 'default' }, { label: 'No background', value: 'none' }, { label: 'Use custom background', value: 'custom' }]}
                        onChange={(value) => setAttributes({ backgroundMode: value, backgroundEnabled: value === 'custom' })}
                    />
                    <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>Margin</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(marginTop ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginTop: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(marginRight ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginRight: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(marginBottom ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginBottom: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(marginLeft ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginLeft: Number(value) || 0 })} />
                    </div>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Width"
                        value={String(width || '')}
                        onChange={(value) => setAttributes({ width: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Height"
                        value={String(height || '')}
                        onChange={(value) => setAttributes({ height: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Minimum height"
                        value={String(minHeight || '')}
                        onChange={(value) => setAttributes({ minHeight: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Background color"
                        value={String(backgroundColor || '')}
                        onChange={(value) => setAttributes({ backgroundColor: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border width (px)"
                        type="number"
                        value={String(borderWidth || 0)}
                        onChange={(value) => setAttributes({ borderWidth: Number(value) || 0 })}
                    />
                    <SelectControl
                        __next40pxDefaultSize
                        label="Border style"
                        value={borderStyle}
                        options={[{ label: 'Solid', value: 'solid' }, { label: 'Dotted', value: 'dotted' }, { label: 'Dashed', value: 'dashed' }, { label: 'Double', value: 'double' }]}
                        onChange={(value) => setAttributes({ borderStyle: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border color"
                        value={String(borderColor || '')}
                        onChange={(value) => setAttributes({ borderColor: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border radius (px)"
                        type="number"
                        value={String(borderRadius || 0)}
                        onChange={(value) => setAttributes({ borderRadius: Number(value) || 0 })}
                    />
                </PanelBody>
            </InspectorControls>
            <div
                {...useBlockProps({ className: 'nodelogic-image-block' })}
                style={wrapperStyle}
                data-nodelogic-id={imageId}
                data-nodelogic-image="1"
            >
                <div className="nodelogic-image-block__frame">
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt={alt}
                            style={{
                                ...(imageWidth ? { width: imageWidth } : {}),
                                ...(imageHeight ? { height: imageHeight } : {}),
                                ...(Number.isFinite(Number(imageScaleX)) && Number(imageScaleX) !== 1 || Number.isFinite(Number(imageScaleY)) && Number(imageScaleY) !== 1 
                                    ? { transform: `scaleX(${Number(imageScaleX) || 1}) scaleY(${Number(imageScaleY) || 1})` }
                                    : {}),
                            }}
                        />
                    ) : (
                        <div className="nodelogic-image-block__placeholder">
                            Image source will be injected here.
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export function ImageBlockSave({ attributes = {} }) {
    const {
        imageId = 'nodelogic-image',
        imageUrl = '',
        alt = 'NodeLogic image',
        imageWidth = '',
        imageHeight = '',
        imageScaleX = 1,
        imageScaleY = 1,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundEnabled = false,
        backgroundColor = '',
        backgroundMode,
        borderWidth = 0,
        borderStyle = 'solid',
        borderColor = '',
        borderRadius = 0,
        width = '',
        height = '',
        minHeight = '',
    } = attributes;
    const safeSrc = imageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');
    const wrapperStyle = buildBoxStyle({
        paddingTop: paddingTop ?? attributes.padding ?? 12,
        paddingRight: paddingRight ?? attributes.padding ?? 12,
        paddingBottom: paddingBottom ?? attributes.padding ?? 12,
        paddingLeft: paddingLeft ?? attributes.padding ?? 12,
        marginTop: marginTop ?? attributes.margin ?? 0,
        marginRight: marginRight ?? attributes.margin ?? 0,
        marginBottom: marginBottom ?? attributes.margin ?? 0,
        marginLeft: marginLeft ?? attributes.margin ?? 0,
        backgroundColor,
        backgroundMode: resolvedBackgroundMode,
        borderWidth,
        borderStyle,
        borderColor,
        borderRadius,
        width,
        height,
        minHeight,
    });

    const imgStyle = {};
    if (imageWidth) { imgStyle.width = imageWidth; }
    if (imageHeight) { imgStyle.height = imageHeight; }
    if (Number.isFinite(Number(imageScaleX)) && Number(imageScaleX) !== 1) {
        imgStyle.transform = `scaleX(${Number(imageScaleX)})${Number.isFinite(Number(imageScaleY)) && Number(imageScaleY) !== 1 ? ` scaleY(${Number(imageScaleY)})` : ''}`;
    } else if (Number.isFinite(Number(imageScaleY)) && Number(imageScaleY) !== 1) {
        imgStyle.transform = `scaleY(${Number(imageScaleY)})`;
    }

    return (
        <div
            {...useBlockProps.save({ className: 'nodelogic-image-block' })}
            style={wrapperStyle}
            data-nodelogic-id={imageId}
            data-nodelogic-image="1"
        >
            <div className="nodelogic-image-block__frame">
                <img src={safeSrc} alt={alt} style={Object.keys(imgStyle).length > 0 ? imgStyle : undefined} />
            </div>
        </div>
    );
}

export function LegacyImageBlockSave({ attributes = {} }) {
    const {
        imageUrl = '',
        alt = 'NodeLogic image',
    } = attributes;
    const safeSrc = imageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    return (
        <div {...useBlockProps.save({ className: 'nodelogic-image-block' })} data-nodelogic-image="1">
            <div className="nodelogic-image-block__frame">
                <img src={safeSrc} alt={alt} />
            </div>
        </div>
    );
}

export function LegacyImageBlockSavePlain({ attributes = {} }) {
    const {
        imageUrl = '',
        alt = 'NodeLogic image',
    } = attributes;
    const safeSrc = imageUrl || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    return (
        <div className="nodelogic-image-block" data-nodelogic-image="1">
            <div className="nodelogic-image-block__frame">
                <img src={safeSrc} alt={alt} />
            </div>
        </div>
    );
}
